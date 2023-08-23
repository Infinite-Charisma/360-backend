import dotenv from "dotenv";
dotenv.config();

import { saveFromCSVFile } from "./utils.js";

export const main = async () => {
  const dataLoadRes = await saveFromCSVFile("exported_1.csv");
  if (dataLoadRes) {
    console.log(`DATA LOADED SUCCESSFULLY`);
  } else {
    console.log(`ERRROR LOADING THE DATA`);
  }
};