const User = require('../models/User');
const Company = require('../models/Company');
const Notification = require('../models/Notification');
const { ethers } = require('ethers');
const { getDataset, getConfirmedMarketplaceTransaction } = require('./blockchainService');

const shortWallet = wallet => wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : 'A wallet';

async function insertForCompany(company, details, eventKey) {
  if (!company || !company.walletAddress) return false;
  const notificationKey = `company:${details.type}:${eventKey}:${company._id}`;
  try {
    const result = await Notification.updateOne({ notificationKey }, {
      $setOnInsert: {
        recipientCompanyId: company._id,
        recipientWallet: company.walletAddress,
        ...details,
        notificationKey,
        read: false
      }
    }, { upsert: true });
    return result.upsertedCount === 1;
  } catch (error) {
    if (error.code === 11000) return false;
    throw error;
  }
}

async function insertForCompanyWallet(wallet, details, eventKey) {
  if (!wallet) return false;
  const company = await Company.findOne({ walletAddress: wallet.toLowerCase(), verificationStatus: 'verified' })
    .select('_id walletAddress');
  return insertForCompany(company, details, eventKey);
}

async function notifyCompanyAccessRequest(request, status) {
  const company = await Company.findById(request.companyId?._id || request.companyId).select('_id walletAddress verificationStatus');
  if (!company || company.verificationStatus !== 'verified' ||
      company.walletAddress !== request.buyerWallet?.toLowerCase()) return false;
  const datasetName = request.dataId?.name || 'the dataset';
  const type = status === 'pending' ? 'ACCESS_REQUEST_SUBMITTED' : status === 'approved' ? 'ACCESS_REQUEST_APPROVED' : 'ACCESS_REQUEST_REJECTED';
  return insertForCompany(company, {
    type,
    title: status === 'pending' ? 'Access request submitted' : `Access request ${status}`,
    message: `Your request for ${datasetName} was ${status === 'pending' ? 'submitted successfully' : status} in the app (off-chain).`,
    relatedDatasetId: String(request.dataId?._id || request.dataId),
    relatedDatasetName: datasetName,
    relatedRequestId: String(request._id)
  }, `offchain:${request._id}:${status}`);
}

async function insertForWallet(wallet, details, txHash) {
  if (!wallet) return false;
  const recipient = await User.findOne({ walletAddress: wallet.toLowerCase() }).select('_id walletAddress notificationsEnabled');
  if (!recipient || recipient.notificationsEnabled === false) return false;

  const notificationKey = `${details.type}:${txHash.toLowerCase()}:${recipient._id}`;
  try {
    const result = await Notification.updateOne({ notificationKey }, {
      $setOnInsert: {
        recipientUserId: recipient._id,
        recipientWallet: recipient.walletAddress || wallet,
        ...details,
        notificationKey,
        relatedTransactionHash: txHash.toLowerCase(),
        read: false
      }
    }, { upsert: true });
    return result.upsertedCount === 1;
  } catch (error) {
    if (error.code === 11000) return false;
    throw error;
  }
}

async function ingestConfirmedTransaction({ transactionHash, actorRole, actorWallet }) {
  const receiptData = await getConfirmedMarketplaceTransaction(transactionHash);
  const txHash = receiptData.transactionHash;
  const actor = String(actorWallet || '').toLowerCase();
  if (!actor) throw new Error('The authenticated account has no linked wallet');
  if (String(receiptData.from || '').toLowerCase() !== actor) {
    throw new Error('The transaction sender does not match the authenticated wallet');
  }

  const created = [];
  for (const event of receiptData.events) {
    const args = event.args;
    const dataId = String(args.dataId ?? args[0]);

    if (event.name === 'DataAdded') {
      const owner = String(args.owner ?? args[1]);
      if (actorRole !== 'user' || owner.toLowerCase() !== actor) continue;
      const dataset = await getDataset(dataId);
      if (await insertForWallet(owner, {
        type: 'DATASET_ADDED',
        title: 'Dataset added',
        message: `${dataset.name} was added to DataChain.`,
        relatedDatasetId: dataId,
        relatedDatasetName: dataset.name
      }, txHash)) created.push('DATASET_ADDED');
      continue;
    }

    if (event.name === 'AccessRequested') {
      const requester = String(args.requester ?? args[1]);
      if (requester.toLowerCase() !== actor) continue;
      const dataset = await getDataset(dataId);
      if (await insertForWallet(dataset.owner, {
        type: 'ACCESS_REQUEST_RECEIVED',
        title: 'New access request',
        message: `${shortWallet(requester)} requested access to ${dataset.name}.`,
        relatedDatasetId: dataId,
        relatedDatasetName: dataset.name,
        relatedRequestId: txHash.toLowerCase()
      }, txHash)) created.push('ACCESS_REQUEST_RECEIVED');
      if (actorRole === 'company' && await insertForCompanyWallet(requester, {
        type: 'ACCESS_REQUEST_SUBMITTED',
        title: 'Access request submitted',
        message: `Your request for ${dataset.name} was confirmed on-chain.`,
        relatedDatasetId: dataId,
        relatedDatasetName: dataset.name,
        relatedTransactionHash: txHash.toLowerCase()
      }, txHash)) created.push('ACCESS_REQUEST_SUBMITTED');
      continue;
    }

    if (event.name === 'AccessApproved' || event.name === 'AccessRejected') {
      const requester = String(args.requester ?? args[1]);
      if (actorRole !== 'user') continue;
      const dataset = await getDataset(dataId);
      if (dataset.owner.toLowerCase() !== actor) continue;
      const approved = event.name === 'AccessApproved';
      const type = approved ? 'ACCESS_REQUEST_APPROVED' : 'ACCESS_REQUEST_REJECTED';
      if (await insertForWallet(requester, {
        type,
        title: approved ? 'Access request approved' : 'Access request rejected',
        message: `Your request for ${dataset.name} was ${approved ? 'approved' : 'rejected'} by the owner.`,
        relatedDatasetId: dataId,
        relatedDatasetName: dataset.name,
        relatedRequestId: txHash.toLowerCase()
      }, txHash)) created.push(type);
      if (await insertForCompanyWallet(requester, {
        type,
        title: approved ? 'Access request approved' : 'Access request rejected',
        message: `Your request for ${dataset.name} was ${approved ? 'approved' : 'rejected'} on-chain.`,
        relatedDatasetId: dataId,
        relatedDatasetName: dataset.name,
        relatedTransactionHash: txHash.toLowerCase()
      }, txHash)) created.push(type);
      continue;
    }

    if (event.name === 'DataPurchased') {
      const buyer = String(args.buyer ?? args[1]);
      const owner = String(args.owner ?? args[2]);
      const amountWei = BigInt(args.amount ?? args[3]);
      const amount = ethers.formatEther(amountWei);
      if (buyer.toLowerCase() !== actor && owner.toLowerCase() !== actor) continue;
      const dataset = await getDataset(dataId);
      if (await insertForWallet(buyer, {
        type: 'PURCHASE_CONFIRMED',
        title: 'Payment successful',
        message: `Payment for ${dataset.name} was confirmed.`,
        relatedDatasetId: dataId,
        relatedDatasetName: dataset.name
      }, txHash)) created.push('PURCHASE_CONFIRMED');
      if (await insertForWallet(owner, {
        type: 'TRANSACTION_CONFIRMED',
        title: 'Payment received',
        message: `Payment for ${dataset.name} was confirmed.`,
        relatedDatasetId: dataId,
        relatedDatasetName: dataset.name
      }, txHash)) created.push('TRANSACTION_CONFIRMED');
      if (amountWei > 0n && await insertForCompanyWallet(buyer, {
        type: 'ETH_DEBITED', title: 'ETH debited',
        message: `${amount} ETH paid for ${dataset.name}. Transaction ${txHash}.`,
        relatedDatasetId: dataId, relatedDatasetName: dataset.name,
        relatedTransactionHash: txHash.toLowerCase()
      }, txHash)) created.push('ETH_DEBITED');
      if (amountWei > 0n && await insertForCompanyWallet(owner, {
        type: 'ETH_CREDITED', title: 'ETH credited',
        message: `${amount} ETH received for ${dataset.name}. Transaction ${txHash}.`,
        relatedDatasetId: dataId, relatedDatasetName: dataset.name,
        relatedTransactionHash: txHash.toLowerCase()
      }, txHash)) created.push('ETH_CREDITED');
    }
  }
  return { transactionHash: txHash, created };
}

module.exports = { ingestConfirmedTransaction, notifyCompanyAccessRequest };
