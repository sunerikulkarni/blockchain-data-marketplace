const { ethers } = require("hardhat");

async function main() {
  const contractAddress =
    "0x02018B847dA98a987EE59d7F235b2c690085F044";

  const DataMarketplace =
    await ethers.getContractFactory("DataMarketplace");

  const contract =
    DataMarketplace.attach(contractAddress);

  console.log("Contract address:", contract.target);

  const dataCount = await contract.dataCount();

  console.log(
    "Number of datasets:",
    dataCount.toString()
  );

  console.log("Contract connection successful!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});