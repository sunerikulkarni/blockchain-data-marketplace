require("dotenv").config();
const mongoose = require("mongoose");
const Data = require("../models/Data");
const Transaction = require("../models/Transaction");

async function run() {
    if (!process.env.MONGO_URI) {
        throw new Error("MONGO_URI is missing");
    }

    await mongoose.connect(process.env.MONGO_URI);

    const filter = { name: { $regex: /asthma/i } };
    const found = await Data.find(filter).lean();

    if (!found.length) {
        console.log("No Asthma legacy datasets found.");
        await mongoose.disconnect();
        return;
    }

    const ids = found.map((d) => d._id);
    const dataResult = await Data.updateMany(filter, { $set: { status: "inactive" } });
    const txnResult = await Transaction.deleteMany({ dataId: { $in: ids } });

    console.log(`Marked ${dataResult.modifiedCount} Asthma listing(s) inactive.`);
    console.log(`Removed ${txnResult.deletedCount} related Mongo transaction(s).`);
    await mongoose.disconnect();
}

run().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
