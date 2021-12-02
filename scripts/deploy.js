const hre = require("hardhat"); //import the hardhat
const { utils } = require("ethers");
const {BURN_CYCLE, REBASE_DELTA, COMMON_FEE, BURN_FEE} = process.env;

async function main() {
  const [deployer] = await ethers.getSigners(); //get the account to deploy the contract

  const baseUnit = 18;
  const router = "0x0000000000000000000000000000000000000000";
  const burnCycle = utils.parseUnits(BURN_CYCLE, baseUnit).toBigInt();
  const rebaseDelta = utils.parseUnits(REBASE_DELTA, baseUnit).toBigInt();
  const commonFee = COMMON_FEE;
  const burnFee = BURN_FEE;

  const DGVCImplementation = await ethers.getContractFactory(
    "DGVCImplementation"
  );
  const dgvcImplementation = await DGVCImplementation.deploy();
  await dgvcImplementation.deployed();

  await dgvcImplementation.init(router);
  await dgvcImplementation.setBurnCycle(burnCycle);
  await dgvcImplementation.setRebaseDelta(rebaseDelta);
  await dgvcImplementation.setCommonFee(commonFee);
  await dgvcImplementation.setBurnFee(burnFee);
  await dgvcImplementation.renounceOwnership();

  const DGVCProxy = await hre.ethers.getContractFactory("DGVCProxy");
  let dgvcProxy = await DGVCProxy.deploy();
  await dgvcProxy.deployed();

  await dgvcProxy.setImplementation(dgvcImplementation.address);

  dgvcProxy = new ethers.Contract(
    dgvcProxy.address,
    DGVCImplementation.interface,
    deployer
  );

  await dgvcProxy.init(router);

  await dgvcProxy.setRebaseDelta(rebaseDelta);
  await dgvcProxy.setBurnCycle(burnCycle);

  console.log("dgvcProxy deployed to:", dgvcProxy.address);
  console.log("dgvcImplementation: ", dgvcImplementation.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); // Calling the function to deploy the contract
