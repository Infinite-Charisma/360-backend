import express from "express";
import bodyParser from "body-parser";

import {
  getSold360TokenAmount,
  confirmAndSaveTx,
  getAffiliatesByAddress,
  getUserByAddress,
  extractTransferTxData,
} from "./utils.js";

const port = process.env.port || 5000;
const app = express();

app.use(express.static("public"));
app.use(function (req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "https://360dapp.netlify.app");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.post("/presale/:hash", async (req, res) => {
  let txHash = req.params.hash;
  let walletAddress = req.body.walletAddress.toLowerCase();
  let chainId = req.body.chainID;
  let amount = req.body.amount;
  let tokenSymbol = req.body.token;
  let referee = req.body.referee.toLowerCase();
  let vestingPeriod = req.body.vesting;

  if (
    !txHash ||
    txHash.length == 0 ||
    !walletAddress ||
    walletAddress.length == 0 ||
    !chainId ||
    chainId.length == 0 ||
    !amount ||
    amount.length == 0 ||
    !tokenSymbol ||
    tokenSymbol.length == 0 ||
    !referee ||
    referee.length == 0 ||
    (vestingPeriod != false && vestingPeriod != true)
  ) {
    console.log("Incorrect data");
    res.send("failed");
  }

  let status = await confirmAndSaveTx(
    txHash,
    walletAddress,
    chainId,
    amount,
    tokenSymbol,
    referee,
    vestingPeriod
  );

  // let status = await extractTransferTxData(
  //   txHash,
  //   walletAddress,
  //   chainId,
  //   amount,
  //   tokenSymbol,
  //   referee,
  //   vestingPeriod
  // );

  console.log("status", status);

  if (status === "success") {
    res.send("success");
  } else {
    res.send("failed");
  }
});

app.get("/presale/sold", async (req, res) => {
  let soldTokenAmount = await getSold360TokenAmount();
  res.send(soldTokenAmount[0]);
});

app.get("/presale/affiliates/:address", async (req, res) => {
  const address = req.params.address.toLowerCase();

  if (!address || address.length == 0) res.send("failed");

  const affiliates = await getAffiliatesByAddress(address);
  res.send(affiliates);
});

app.get("/presale/user/:address", async (req, res) => {
  const address = req.params.address.toLowerCase();

  if (!address || address.length == 0) res.send("failed");

  const user = await getUserByAddress(address);
  res.send(user);
});

app.listen(port, async () => {
  console.log(`Server is running at ${port}`);
});
