import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
dotenv.config();
import { WALLETADDRESS_LIST, CSV_FIELDS } from "./const.js";

import { saveFromCSVFile } from "./utils.js";

export const main = async () => {
  console.log(`STARTING LOADING DATA FROM CSV FILE`);
  // const dataLoadRes = true;
  const dataLoadRes = await saveFromCSVFile("exported_1.csv");
  // const dataLoadRes = await saveFromCSVFile("test.csv");
  if (dataLoadRes) {
    console.log(`DATA LOADED SUCCESSFULLY`);
  } else {
    console.log(`ERRROR LOADING THE DATA`);
  }
};

main();
