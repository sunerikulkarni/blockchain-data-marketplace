const { ethers } = require("hardhat");

async function main() {
  const [account] = await ethers.getSigners();

  console.log("Connected to Sepolia");
  console.log("Wallet address:", account.address);

  const balance = await ethers.provider.getBalance(account.address);

  console.log(
    "Balance:",
    ethers.formatEther(balance),
    "ETH"
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});