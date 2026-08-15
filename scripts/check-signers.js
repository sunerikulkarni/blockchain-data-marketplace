const { ethers } = require("hardhat");

async function main() {
  const signers = await ethers.getSigners();

  console.log("Number of signers:", signers.length);

  for (let i = 0; i < signers.length; i++) {
    console.log(`Signer ${i + 1}:`, signers[i].address);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});