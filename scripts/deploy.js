const { ethers } = require("hardhat");

async function main() {
  const DataMarketplace = await ethers.getContractFactory("DataMarketplace");
  const contract = await DataMarketplace.deploy();
  await contract.waitForDeployment();

  console.log("Contract deployed to:", contract.target);

  // Add data
 await contract.addData(
  "Health Data",
  "Health",
  "User fitness data",
  100
);

  console.log("Data added!");

  // Buy data (send ETH)
  await contract.addData(
  "Health Data",
  "Health",
  "User fitness and heart rate data",
  100
);
  console.log("Data purchased!");

  // Fetch data
  const data = await contract.getData(1);
  console.log("Fetched Data:", data);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});