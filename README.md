# Backend server for the 360 token presale

#### Features

- REST API for receiving data about new presale buy orders, showcasing data about afiiliates and current presale sale round
- Data loading from csv files
- Integration with supabase
- ERC20 transfer amount extraction from tx data

#### List of current issues to fix:

- Extraction of transfer amount for ERC20 tokens - DONE
- Skipping 0 / NULL value transfers - DONE
- error handling for RPC, wrong responses etc (adding logging for debugging)
- Adding user that invited someone to user based on their first tx and vesting type to each tx - DONE
- Better calculation for the amount of tokens that the user gets e.g. in case of user who buys let's say 100 tokens during end of the sale round 1 wherere there are only 10 tokens left the script will calculate the price from the first sale round for all of these tokens meanwhile it should get the price from the first sale round for the first 10 and then from the second presale for the reamining 90 tokens - DONE
- We need to add views in the db to better showcase the affiliates for specific addresses - In Progress
