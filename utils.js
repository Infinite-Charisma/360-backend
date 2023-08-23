import { ethers } from "ethers";
import axios from "axios";
import fs from "fs";
import { parse } from "csv-parse";
import { WALLETADDRESS_LIST, CSV_FIELDS } from "./const.js";
import supabase from "./db/supabase.js";
import dotenv from "dotenv";
dotenv.config();
import * as TOKEN_PRESALE_ABI from "./abi/TokenPresale.json" assert { type: "json" };
import * as ERC20_ABI from "./abi/DAI_ERC20.json" assert { type: "json" };

const isTxDataValidate = async (
  provider,
  walletAddress,
  tokenValue,
  txHash,
  chainId,
  tokenSymbol
) => {
  const transaction = await provider.getTransaction(txHash);

  if (transaction) {
    const fromWalletAddress = transaction.from;
    const toWalletAddress = transaction.to;
    const transferValue = transaction.value;
    const chainID = transaction.chainId;

    if (
      fromWalletAddress.toLowerCase() === walletAddress.toLowerCase() &&
      //   transferValue > 0 &&
      ((tokenSymbol == "MATIC" && transferValue === tokenValue) ||
        (await extractTransferTxData(
          txHash,
          //   walletAddress,
          chainId,
          tokenValue,
          tokenSymbol
          //   referee,
          //   vestingPeriod
        ))) &&
      chainID == chainId
    ) {
      return true;
    }
  }
  return false;
};

const isTxHashExist = async (txHash) => {
  const { data } = await supabase
    .from("presale")
    .select()
    .eq("transactionHash", txHash);
  if (data && data.length) {
    return true;
  }
  return false;
};

const isTxMined = async (provider, txHash) => {
  let tx_receipt = await provider.getTransactionReceipt(txHash);
  if (tx_receipt && tx_receipt.status === 1) {
    return true;
  }
  return false;
};

const isProvided = async (provider, toWalletAddress) => {
  const lowerCaseWalletAddresses = WALLETADDRESS_LIST.map((address) =>
    address.toLowerCase()
  );
  const lowerCaseToWalletAddress = toWalletAddress.toLowerCase();

  if (lowerCaseWalletAddresses.indexOf(lowerCaseToWalletAddress) === -1) {
    return false;
  } else {
    return true;
  }
};

const saveTransaction = async (newTx, referee) => {
  try {
    const { data } = await supabase.from("presale").insert(newTx).select();
    const res1 = await supabase.rpc("increase_sold_token", {
      x: newTx.presaleTokenAmount,
      row_id: 0,
    });
    // console.log(res1);
    const res2 = await supabase.rpc("increase_user_alloc", {
      x: newTx.presaleTokenAmount,
      user_addr: newTx.walletAddress,
      invited_by: referee,
    });
    // console.log(res2);
    return data;
  } catch (error) {
    console.error(error);
  }
};

const setProvider = (chainID) => {
  //we set the Polygon Mumbai Provider for test
  try {
    let provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
    return provider;
  } catch (error) {
    console.log("Please check RPC connection");
  }
};

const getUsdCurrency = async (currency, volume) => {
  let exchangeRate;

  if (currency === "MATIC") {
    exchangeRate = await axios.get(
      "https://min-api.cryptocompare.com/data/price?fsym=MATIC&tsyms=USD"
    );
  }
  if (currency === "DAI") {
    exchangeRate = await axios.get(
      "https://min-api.cryptocompare.com/data/price?fsym=DAI&tsyms=USD"
    );
  }
  if (currency === "USDT") {
    exchangeRate = await axios.get(
      "https://min-api.cryptocompare.com/data/price?fsym=USDT&tsyms=USD"
    );
  }
  if (currency === "USDC") {
    exchangeRate = await axios.get(
      "https://min-api.cryptocompare.com/data/price?fsym=USDC&tsyms=USD"
    );
  }

  return volume * exchangeRate.data.USD;
};

const get360TokenValue = async (usdValue) => {
  const tokenPricePerRound = {
    round1: 0.03,
    round2: 0.04,
    round3: 0.05,
  };
  const soldTokenAmount = await getSold360TokenAmount().then(
    (res) => res[0].amount
  );
  let assigned360TokenValue;
  let tokenVolumePerRound = {
    round1: 1e9,
    round2: 1e9,
    round3: 2e9,
  };

  if (soldTokenAmount < tokenVolumePerRound["round1"]) {
    tokenVolumePerRound["round1"] -= soldTokenAmount;
  } else if (
    soldTokenAmount - tokenVolumePerRound["round1"] <
    tokenVolumePerRound["round2"]
  ) {
    tokenVolumePerRound["round2"] -=
      soldTokenAmount - tokenVolumePerRound["round1"];
    tokenVolumePerRound["round1"] = 0;
  } else {
    tokenVolumePerRound["round3"] -=
      soldTokenAmount -
      tokenVolumePerRound["round1"] -
      tokenVolumePerRound["round2"];
    tokenVolumePerRound["round2"] = 0;
    tokenVolumePerRound["round1"] = 0;
  }

  if (tokenPricePerRound["round1"] * tokenVolumePerRound["round1"] > usdValue) {
    assigned360TokenValue = usdValue / tokenPricePerRound["round1"];
    tokenVolumePerRound["round1"] -= assigned360TokenValue;
  } else if (
    tokenPricePerRound["round2"] * tokenVolumePerRound["round2"] >
    usdValue - tokenPricePerRound["round1"] * tokenVolumePerRound["round1"]
  ) {
    assigned360TokenValue =
      tokenVolumePerRound["round1"] +
      (usdValue -
        tokenPricePerRound["round1"] * tokenVolumePerRound["round1"]) /
        tokenPricePerRound["round2"];
    tokenVolumePerRound["round2"] =
      tokenVolumePerRound["round2"] -
      (usdValue -
        tokenPricePerRound["round1"] * tokenVolumePerRound["round1"]) /
        tokenPricePerRound["round2"];
    tokenVolumePerRound["round1"] = 0;
  } else {
    usdValue -=
      tokenVolumePerRound["round1"] * tokenPricePerRound["round1"] +
      tokenVolumePerRound["round2"] * tokenPricePerRound["round2"];
    assigned360TokenValue =
      tokenVolumePerRound["round1"] +
      tokenVolumePerRound["round2"] +
      usdValue / tokenPricePerRound["round3"];
    tokenVolumePerRound["round3"] -= usdValue / tokenPricePerRound["round3"];
    tokenVolumePerRound["round1"] = 0;
    tokenVolumePerRound["round2"] = 0;
  }

  return assigned360TokenValue;
};

const getSold360TokenAmount = async () => {
  let { data } = await supabase.from("soldtokenamount").select("amount");
  return data;
};

const getAffiliatesByAddress = async (inviter) => {
  try {
    let { data } = await supabase
      .from("users")
      .select()
      .eq("invitedbyaddr", inviter);
    return data;
  } catch (err) {
    console.error(err);
  }
};

const getUserByAddress = async (address) => {
  try {
    let { data } = await supabase.from("users").select().eq("address", address);
    return data;
  } catch (err) {
    console.error(err);
  }
};

async function waitFor(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

const confirmAndSaveTx = async (
  txHash,
  walletAddress,
  chainId,
  amount,
  tokenSymbol,
  referee,
  vestingPeriod
) => {
  try {
    // console.log("tx confirming");
    const provider = setProvider(chainId);
    const transaction = await provider.getTransaction(txHash);
    const toWalletAddress = transaction.to;
    const isValidate =
      (await isTxHashExist(txHash)) == false &&
      (await isTxMined(provider, txHash)) &&
      (await isTxDataValidate(
        provider,
        walletAddress,
        amount,
        txHash,
        chainId,
        tokenSymbol
      )) &&
      (await isProvided(provider, toWalletAddress));

    //   console.log(
    //     await isTxHashExist(txHash),
    //     await isTxMined(provider, txHash),
    //     await isTxDataValidate(
    //       provider,
    //       walletAddress,
    //       amount,
    //       txHash,
    //       chainId
    //     ),
    //     await isProvided(provider, toWalletAddress),
    //     isValidate
    //   );

    if (isValidate) {
      let trueReferee = "";
      if (referee.toLowerCase() != walletAddress.toLowerCase())
        trueReferee = referee;
      for (let usdAmount = NaN; isNaN(usdAmount); ) {
        usdAmount = await getUsdCurrency(tokenSymbol, amount);
        // console.log(
        //   tokenSymbol,
        //   " ",
        //   amount,
        //   " ",
        //   usdAmount,
        //   " ",
        //   isNaN(usdAmount)
        // );
        await waitFor(1);
        if (isNaN(usdAmount)) skip;
        const assigned360TokenValue = await get360TokenValue(usdAmount);
        const newRecord = {
          walletAddress: walletAddress,
          sentToken: tokenSymbol,
          sentTokenAmount: usdAmount,
          presaleTokenAmount: parseFloat(assigned360TokenValue),
          transactionHash: txHash,
          vesting: vestingPeriod,
        };
        const data = await saveTransaction(newRecord, trueReferee);
        return "success";
        // return data;
        //     // console.log(newRecord);
        //     // return newRecord;
      }
    } else {
      return {};
    }
  } catch (err) {
    return err;
  }
};

const extractTransferTxData = async (
  txHash,
  //   walletAddress,
  chainId,
  amount,
  tokenSymbol
  //   affiliate,
  //   vesting
) => {
  try {
    // console.log(TOKEN_PRESALE_ABI.default);
    const provider = setProvider(chainId);
    const transaction = await provider.getTransaction(txHash);
    const iface = new ethers.utils.Interface(ERC20_ABI.default);
    const decodedTx = await iface.decodeFunctionData(
      "transfer",
      transaction.data
    );
    console.log(decodedTx);
    const pledgeToken = transaction.to;
    const pledgeAmount = decodedTx.wad;
    const receiver = decodedTx.dst;
    let finalAmount;

    if (
      transaction.to == "0xc2132D05D31c914a87C6611C10748AEb04B58e8F" ||
      transaction.to == "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"
    ) {
      finalAmount = ethers.utils.formatUnits(pledgeAmount, 6);
    } else {
      finalAmount = ethers.utils.formatUnits(pledgeAmount, 18);
    }

    // console.log(
    //   amount == finalAmount,
    //   finalAmount > 0,
    //   pledgeToken.toLowerCase() ==
    //     "0xc2132D05D31c914a87C6611C10748AEb04B58e8F".toLowerCase() ||
    //     pledgeToken.toLowerCase() ==
    //       "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174".toLowerCase() ||
    //     pledgeToken.toLowerCase() ==
    //       "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063".toLowerCase() ||
    //     pledgeToken.toLowerCase() ==
    //       "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619".toLowerCase(), // WETH for testing
    //   tokenSymbol == "DAI" ||
    //     tokenSymbol == "USDC" ||
    //     tokenSymbol == "USDT" ||
    //     tokenSymbol == "WETH",
    //   amount,
    //   finalAmount,
    //   pledgeToken.toLowerCase()
    // );

    if (
      amount == finalAmount &&
      finalAmount > 0 &&
      (pledgeToken.toLowerCase() ==
        "0xc2132D05D31c914a87C6611C10748AEb04B58e8F".toLowerCase() ||
        pledgeToken.toLowerCase() ==
          "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174".toLowerCase() ||
        pledgeToken.toLowerCase() ==
          "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063".toLowerCase() ||
        pledgeToken.toLowerCase() ==
          "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619".toLowerCase()) &&
      (tokenSymbol == "DAI" ||
        tokenSymbol == "USDC" ||
        tokenSymbol == "USDT" ||
        tokenSymbol == "WETH")
    ) {
      //   const saveTxRes = await confirmAndSaveTx(
      //     txHash,
      //     walletAddress,
      //     chainId,
      //     finalAmount,
      //     tokenSymbol,
      //     affiliate,
      //     vesting
      //   );
      //   return saveTxRes;
      return true;
    } else {
      return false;
    }
  } catch (err) {
    console.log(err);
    return false;
  }
};

const extractPresaleTxData = async (
  txHash,
  walletAddress,
  chainId,
  amount,
  tokenSymbol
) => {
  try {
    const provider = setProvider(chainId);
    const transaction = await provider.getTransaction(txHash);
    // console.log(transaction);
    const iface = new ethers.utils.Interface(TOKEN_PRESALE_ABI.default);
    const pledgeAmount = (
      await iface.decodeFunctionData("pledge", transaction.data)
    )._amount;
    const pledgeToken = await iface.decodeFunctionData(
      "pledge",
      transaction.data
    )._tokenId;
    const affiliate = await iface.decodeFunctionData("pledge", transaction.data)
      ._affiliate;
    const vesting = await iface.decodeFunctionData("pledge", transaction.data)
      ._vestingType;
    let finalAmount;

    if (
      pledgeToken == "0xc2132D05D31c914a87C6611C10748AEb04B58e8F" ||
      pledgeToken == "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"
    ) {
      finalAmount = ethers.utils.formatUnits(pledgeAmount, 6) * 0.03;
    } else {
      finalAmount = ethers.utils.formatUnits(pledgeAmount, 18) * 0.03;
    }

    // console.log(
    //   txHash,
    //   " ->  ",
    //   amount,
    //   " ->  ",
    //   pledgeAmount,
    //   " ->  ",
    //   finalAmount,
    //   " ",
    //   pledgeToken
    // );

    if (
      amount == finalAmount &&
      finalAmount > 0 &&
      (pledgeToken == "0xc2132D05D31c914a87C6611C10748AEb04B58e8F" ||
        pledgeToken == "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" ||
        pledgeToken == "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063")
    ) {
      const saveTxRes = await confirmAndSaveTx(
        txHash,
        walletAddress,
        chainId,
        finalAmount,
        tokenSymbol,
        affiliate,
        vesting
      );
      return saveTxRes;
    } else {
      return false;
    }
  } catch (err) {
    // console.log(err);
    return false;
  }
};

const saveFromCSVFile = async (fileName) => {
  try {
    let rowIndex = 0;
    fs.createReadStream(`./public/${fileName}`)
      .pipe(parse({ delimiter: ",", from_line: 2 }))
      .on("data", async (row) => {
        let txHash = row[CSV_FIELDS.indexOf("TxHash")];
        let walletAddress = row[CSV_FIELDS.indexOf("From")].toLowerCase();
        let chainId = "137";
        let amount = parseFloat(row[CSV_FIELDS.indexOf("TokenValue")]);
        let tokenSymbol = row[CSV_FIELDS.indexOf("TokenSymbol")];
        // console.log(rowIndex++);
        const saveTxRes = await extractPresaleTxData(
          txHash,
          walletAddress,
          chainId,
          amount,
          tokenSymbol
        );
        if (saveTxRes == "success") {
          // console.log("success");
          return true;
        } else return false;
      });
    return true;
  } catch (err) {
    console.log(err);
    return false;
  }
};

export {
  getSold360TokenAmount,
  confirmAndSaveTx,
  saveFromCSVFile,
  getAffiliatesByAddress,
  getUserByAddress,
  extractTransferTxData,
};
