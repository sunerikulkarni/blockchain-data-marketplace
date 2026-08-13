const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DataMarketplace", function () {

  async function deployMarketplace() {

    const [owner, buyer, otherAccount] =
      await ethers.getSigners();

    const DataMarketplace =
      await ethers.getContractFactory("DataMarketplace");

    const marketplace =
      await DataMarketplace.deploy();

    await marketplace.waitForDeployment();

    const price = ethers.parseEther("0.001");

    const ipfsCID = "QmExampleCID123";

    const dataHash =
      "example-hash-123456789";

    return {
      marketplace,
      owner,
      buyer,
      otherAccount,
      price,
      ipfsCID,
      dataHash
    };
  }


  // =========================================================
  // DEPLOYMENT
  // =========================================================

  describe("Deployment", function () {

    it("Should start with zero datasets", async function () {

      const { marketplace } =
        await deployMarketplace();

      expect(
        await marketplace.dataCount()
      ).to.equal(0);
    });

  });


  // =========================================================
  // ADD DATA
  // =========================================================

  describe("Adding data", function () {

    it("Should add a dataset correctly", async function () {

      const {
        marketplace,
        owner,
        price,
        ipfsCID,
        dataHash
      } = await deployMarketplace();

      await marketplace.connect(owner).addData(
        "Health Data",
        "Health",
        "User fitness and heart rate data",
        price,
        ipfsCID,
        dataHash
      );

      expect(
        await marketplace.dataCount()
      ).to.equal(1);

      const data =
        await marketplace.getData(1);

      expect(data[0]).to.equal(1);
      expect(data[1]).to.equal("Health Data");
      expect(data[2]).to.equal("Health");
      expect(data[4]).to.equal(price);
      expect(data[5]).to.equal(owner.address);
      expect(data[6]).to.equal(ipfsCID);
      expect(data[7]).to.equal(dataHash);
    });


    it("Should emit DataAdded event", async function () {

      const {
        marketplace,
        owner,
        price,
        ipfsCID,
        dataHash
      } = await deployMarketplace();

      await expect(
        marketplace.connect(owner).addData(
          "Health Data",
          "Health",
          "User fitness and heart rate data",
          price,
          ipfsCID,
          dataHash
        )
      )
        .to.emit(marketplace, "DataAdded")
        .withArgs(1, owner.address, price);
    });

  });


  // =========================================================
  // ACCESS REQUEST
  // =========================================================

  describe("Access requests", function () {

    it("Should allow a buyer to request access", async function () {

      const {
        marketplace,
        owner,
        buyer,
        price,
        ipfsCID,
        dataHash
      } = await deployMarketplace();

      await marketplace.connect(owner).addData(
        "Health Data",
        "Health",
        "User fitness and heart rate data",
        price,
        ipfsCID,
        dataHash
      );

      await marketplace.connect(buyer).requestAccess(1);

      const status =
        await marketplace.getAccessStatus(
          1,
          buyer.address
        );

      expect(status).to.equal(1);
    });


    it("Should emit AccessRequested event", async function () {

      const {
        marketplace,
        owner,
        buyer,
        price,
        ipfsCID,
        dataHash
      } = await deployMarketplace();

      await marketplace.connect(owner).addData(
        "Health Data",
        "Health",
        "User fitness and heart rate data",
        price,
        ipfsCID,
        dataHash
      );

      await expect(
        marketplace.connect(buyer).requestAccess(1)
      )
        .to.emit(marketplace, "AccessRequested")
        .withArgs(1, buyer.address);
    });

  });


  // =========================================================
  // APPROVAL
  // =========================================================

  describe("Access approval", function () {

    it("Should allow the owner to approve a request", async function () {

      const {
        marketplace,
        owner,
        buyer,
        price,
        ipfsCID,
        dataHash
      } = await deployMarketplace();

      await marketplace.connect(owner).addData(
        "Health Data",
        "Health",
        "User fitness and heart rate data",
        price,
        ipfsCID,
        dataHash
      );

      await marketplace.connect(buyer).requestAccess(1);

      await marketplace.connect(owner).approveAccess(
        1,
        buyer.address
      );

      const status =
        await marketplace.getAccessStatus(
          1,
          buyer.address
        );

      expect(status).to.equal(2);
    });


    it("Should not allow another account to approve access", async function () {

      const {
        marketplace,
        owner,
        buyer,
        otherAccount,
        price,
        ipfsCID,
        dataHash
      } = await deployMarketplace();

      await marketplace.connect(owner).addData(
        "Health Data",
        "Health",
        "User fitness and heart rate data",
        price,
        ipfsCID,
        dataHash
      );

      await marketplace.connect(buyer).requestAccess(1);

      await expect(
        marketplace.connect(otherAccount).approveAccess(
          1,
          buyer.address
        )
      ).to.be.revertedWith(
        "Only owner can approve"
      );
    });

  });


  // =========================================================
  // REJECTION
  // =========================================================

  describe("Access rejection", function () {

    it("Should allow the owner to reject a request", async function () {

      const {
        marketplace,
        owner,
        buyer,
        price,
        ipfsCID,
        dataHash
      } = await deployMarketplace();

      await marketplace.connect(owner).addData(
        "Health Data",
        "Health",
        "User fitness and heart rate data",
        price,
        ipfsCID,
        dataHash
      );

      await marketplace.connect(buyer).requestAccess(1);

      await marketplace.connect(owner).rejectAccess(
        1,
        buyer.address
      );

      const status =
        await marketplace.getAccessStatus(
          1,
          buyer.address
        );

      expect(status).to.equal(3);
    });

  });


  // =========================================================
  // PAYMENT
  // =========================================================

  describe("Data purchase", function () {

    it("Should reject payment before access approval", async function () {

      const {
        marketplace,
        owner,
        buyer,
        price,
        ipfsCID,
        dataHash
      } = await deployMarketplace();

      await marketplace.connect(owner).addData(
        "Health Data",
        "Health",
        "User fitness and heart rate data",
        price,
        ipfsCID,
        dataHash
      );

      await expect(
        marketplace.connect(buyer).buyData(
          1,
          { value: price }
        )
      ).to.be.revertedWith(
        "Access not approved"
      );
    });


    it("Should reject incorrect payment amount", async function () {

      const {
        marketplace,
        owner,
        buyer,
        price,
        ipfsCID,
        dataHash
      } = await deployMarketplace();

      await marketplace.connect(owner).addData(
        "Health Data",
        "Health",
        "User fitness and heart rate data",
        price,
        ipfsCID,
        dataHash
      );

      await marketplace.connect(buyer).requestAccess(1);

      await marketplace.connect(owner).approveAccess(
        1,
        buyer.address
      );

      await expect(
        marketplace.connect(buyer).buyData(
          1,
          {
            value: ethers.parseEther("0.002")
          }
        )
      ).to.be.revertedWith(
        "Incorrect ETH amount"
      );
    });


    it("Should allow an approved buyer to purchase data", async function () {

      const {
        marketplace,
        owner,
        buyer,
        price,
        ipfsCID,
        dataHash
      } = await deployMarketplace();

      await marketplace.connect(owner).addData(
        "Health Data",
        "Health",
        "User fitness and heart rate data",
        price,
        ipfsCID,
        dataHash
      );

      await marketplace.connect(buyer).requestAccess(1);

      await marketplace.connect(owner).approveAccess(
        1,
        buyer.address
      );

      await expect(
        marketplace.connect(buyer).buyData(
          1,
          {
            value: price
          }
        )
      )
        .to.emit(marketplace, "DataPurchased")
        .withArgs(
          1,
          buyer.address,
          owner.address,
          price
        );
    });

  });


  // =========================================================
  // AUTHORIZATION
  // =========================================================

  describe("Access authorization", function () {

    it("Should authorize the buyer after successful payment", async function () {

      const {
        marketplace,
        owner,
        buyer,
        price,
        ipfsCID,
        dataHash
      } = await deployMarketplace();

      await marketplace.connect(owner).addData(
        "Health Data",
        "Health",
        "User fitness and heart rate data",
        price,
        ipfsCID,
        dataHash
      );

      await marketplace.connect(buyer).requestAccess(1);

      await marketplace.connect(owner).approveAccess(
        1,
        buyer.address
      );

      await marketplace.connect(buyer).buyData(
        1,
        {
          value: price
        }
      );

      expect(
        await marketplace.hasAccess(
          1,
          buyer.address
        )
      ).to.equal(true);
    });


    it("Should change status to AUTHORIZED after payment", async function () {

      const {
        marketplace,
        owner,
        buyer,
        price,
        ipfsCID,
        dataHash
      } = await deployMarketplace();

      await marketplace.connect(owner).addData(
        "Health Data",
        "Health",
        "User fitness and heart rate data",
        price,
        ipfsCID,
        dataHash
      );

      await marketplace.connect(buyer).requestAccess(1);

      await marketplace.connect(owner).approveAccess(
        1,
        buyer.address
      );

      await marketplace.connect(buyer).buyData(
        1,
        {
          value: price
        }
      );

      const status =
        await marketplace.getAccessStatus(
          1,
          buyer.address
        );

      expect(status).to.equal(4);
    });

  });

});