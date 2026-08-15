const { ethers } = require("hardhat");

async function main() {
  const [owner] = await ethers.getSigners();

  console.log("Deploying with owner:", owner.address);

  const DataMarketplace =
    await ethers.getContractFactory("DataMarketplace");

  const contract = await DataMarketplace.deploy();

  await contract.waitForDeployment();

  console.log("Contract deployed to:", contract.target);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});