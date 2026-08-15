const { ethers } = require("hardhat");

async function main() {
  const contractAddress =
    "0x02018B847dA98a987EE59d7F235b2c690085F044";

  const DataMarketplace =
    await ethers.getContractFactory("DataMarketplace");

  const contract =
    DataMarketplace.attach(contractAddress);

  console.log("Contract address:", contract.target);

  const data = await contract.getData(1);

  console.log("Dataset ID:", data[0].toString());
  console.log("Name:", data[1]);
  console.log("Category:", data[2]);
  console.log("Description:", data[3]);
  console.log(
    "Price:",
    ethers.formatEther(data[4]),
    "ETH"
  );
  console.log("Owner:", data[5]);
  console.log("IPFS CID:", data[6]);
  console.log("Data Hash:", data[7]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});