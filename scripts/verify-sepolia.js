const { ethers } = require("hardhat");

async function main() {
  const contractAddress =
    "0x02018B847dA98a987EE59d7F235b2c690085F044";

  const DataMarketplace =
    await ethers.getContractFactory("DataMarketplace");

  const contract =
    DataMarketplace.attach(contractAddress);

  console.log("Contract address:", contract.target);

  const owner = await contract.owner();

  console.log("Contract owner:", owner);

  const dataCount = await contract.dataCount();

  console.log("Number of datasets:", dataCount.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});