const Ganache = require('./helpers/ganache');
const { BigNumber, utils } = require('ethers');
const { expect } = require('chai');

describe('DGVC Regular Transfers', function() {
  const BNtoBigInt = (input) => BigInt(input.toString());
  const BigInttoBN = (input) => BigNumber.from(input.toString());

  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
  const ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
  const baseUnit = 18;
  const ganache = new Ganache();

  const totalSupply = utils.parseUnits('12000000', baseUnit).toBigInt();
  const burnCycle = utils.parseUnits('1275000', baseUnit).toBigInt(); // TODO: change value
  const rebaseDelta = utils.parseUnits('500000', baseUnit).toBigInt(); // TODO: change value
  
  const HUNDRED_PERCENT = 10000n;
  const FEE = 500n;
  const PART_FEE = 250n;

  let accounts;
  let dgvcImplementation;
  let dgvcProxy;
  let owner;
  let user;
  let feeReceiver;
  let userTwo;

  before('setup others', async () => {
    accounts = await ethers.getSigners();
    owner = accounts[0];
    user = accounts[1];
    feeReceiver = accounts[2];
    userTwo = accounts[3];

    const DGVCImplementation = await ethers.getContractFactory('DGVCImplementation');
    dgvcImplementation = await DGVCImplementation.deploy();
    await dgvcImplementation.deployed();

    //lock implementation
    await dgvcImplementation.init(ROUTER);
    await dgvcImplementation.renounceOwnership();

    //setup proxy
    const DGVCProxy = await ethers.getContractFactory('DGVCProxy');
    dgvcProxy = await DGVCProxy.deploy();
    await dgvcProxy.deployed();

    await dgvcProxy.setImplementation(dgvcImplementation.address);

    dgvcProxy = new ethers.Contract(dgvcProxy.address, DGVCImplementation.interface, owner);
    await dgvcProxy.init(ROUTER);

    await dgvcProxy.setRebaseDelta(rebaseDelta);
    await dgvcProxy.setBurnCycle(burnCycle);

    await ganache.snapshot();
  });

  afterEach('revert', function() { return ganache.revert(); });

  it('should be possible to do a regular transfer of 1000 DGVC for a user with common fee / burn', async function () {
    const amount = utils.parseUnits('1000', baseUnit).toBigInt();

    expect(await dgvcProxy.commonBurnFee()).to.equal(0);
    expect(await dgvcProxy.commonFotFee()).to.equal(0);

    await dgvcProxy.setCommonFee(PART_FEE);
    await dgvcProxy.setBurnFee(PART_FEE);

    expect(await dgvcProxy.commonBurnFee()).to.equal(PART_FEE);
    expect(await dgvcProxy.commonFotFee()).to.equal(PART_FEE);

    await dgvcProxy.setFeeReceiver(feeReceiver.address);

    expect(await dgvcProxy.balanceOf(owner.address)).to.equal(totalSupply);
    expect(await dgvcProxy.balanceOf(user.address)).to.equal(0);
    expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(0);
    expect(await dgvcProxy.actualBurnCycle()).to.equal(0);
    expect(await dgvcProxy.totalBurn()).to.equal(0);

    await dgvcProxy.transfer(user.address, amount);

    expect(await dgvcProxy.actualBurnCycle()).to.equal(amount * PART_FEE / HUNDRED_PERCENT);
    expect(await dgvcProxy.totalBurn()).to.equal(amount * PART_FEE / HUNDRED_PERCENT);

    expect(await dgvcProxy.balanceOf(owner.address)).to.equal(totalSupply - amount);
    expect(await dgvcProxy.balanceOf(user.address)).to.equal(amount - (amount * FEE /HUNDRED_PERCENT));
    expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(amount * PART_FEE / HUNDRED_PERCENT);

    expect(await dgvcProxy.totalSupply()).to.equal(totalSupply - (amount * PART_FEE / HUNDRED_PERCENT));
  });

  it('should be possible to do a regular transfer of 1000 DGVC for a user with 0% common fee / burn', async function () {
    const amount = utils.parseUnits('1000', baseUnit).toBigInt();

    expect(await dgvcProxy.commonBurnFee()).to.equal(0);
    expect(await dgvcProxy.commonFotFee()).to.equal(0);

    await dgvcProxy.setFeeReceiver(feeReceiver.address);

    expect(await dgvcProxy.balanceOf(owner.address)).to.equal(totalSupply);
    expect(await dgvcProxy.balanceOf(user.address)).to.equal(0);
    expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(0);
    expect(await dgvcProxy.actualBurnCycle()).to.equal(0);
    expect(await dgvcProxy.totalBurn()).to.equal(0);

    await dgvcProxy.transfer(user.address, amount);

    expect(await dgvcProxy.actualBurnCycle()).to.equal(0);
    expect(await dgvcProxy.totalBurn()).to.equal(0);

    expect(await dgvcProxy.balanceOf(owner.address)).to.equal(totalSupply - amount);
    expect(await dgvcProxy.balanceOf(user.address)).to.equal(amount);
    expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(0);

    expect(await dgvcProxy.totalSupply()).to.equal(totalSupply);
  });

  it('should be possible to do a regular transfer with common fee 2% and burn 0%', async () => {
    const COMMON_FEE = 200n;
    const amount = utils.parseUnits('1000', baseUnit).toBigInt();

    await dgvcProxy.setCommonFee(COMMON_FEE);

    expect(await dgvcProxy.commonBurnFee()).to.equal(0);
    expect(await dgvcProxy.commonFotFee()).to.equal(COMMON_FEE);

    await dgvcProxy.setFeeReceiver(feeReceiver.address);

    expect(await dgvcProxy.balanceOf(owner.address)).to.equal(totalSupply);
    expect(await dgvcProxy.balanceOf(user.address)).to.equal(0);
    expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(0);
    expect(await dgvcProxy.actualBurnCycle()).to.equal(0);
    expect(await dgvcProxy.totalBurn()).to.equal(0);

    await dgvcProxy.transfer(user.address, amount);

    expect(await dgvcProxy.actualBurnCycle()).to.equal(0);
    expect(await dgvcProxy.totalBurn()).to.equal(0);

    expect(await dgvcProxy.balanceOf(owner.address)).to.equal(totalSupply - amount);
    expect(await dgvcProxy.balanceOf(user.address)).to.equal(amount - (amount * COMMON_FEE /HUNDRED_PERCENT));
    expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(amount * COMMON_FEE / HUNDRED_PERCENT);

    expect(await dgvcProxy.totalSupply()).to.equal(totalSupply);
  });

  it('should be possible to do a regular transfer with common fee 0% and burn 3%', async () => {
    const amount = utils.parseUnits('1000', baseUnit).toBigInt();
    const BURN_FEE = 300n;

    expect(await dgvcProxy.commonBurnFee()).to.equal(0);
    expect(await dgvcProxy.commonFotFee()).to.equal(0);

    await dgvcProxy.setBurnFee(BURN_FEE);

    expect(await dgvcProxy.commonBurnFee()).to.equal(BURN_FEE);

    await dgvcProxy.setFeeReceiver(feeReceiver.address);

    expect(await dgvcProxy.balanceOf(owner.address)).to.equal(totalSupply);
    expect(await dgvcProxy.balanceOf(user.address)).to.equal(0);
    expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(0);
    expect(await dgvcProxy.actualBurnCycle()).to.equal(0);
    expect(await dgvcProxy.totalBurn()).to.equal(0);

    await dgvcProxy.transfer(user.address, amount);

    expect(await dgvcProxy.actualBurnCycle()).to.equal(amount * BURN_FEE / HUNDRED_PERCENT);
    expect(await dgvcProxy.totalBurn()).to.equal(amount * BURN_FEE / HUNDRED_PERCENT);

    expect(await dgvcProxy.balanceOf(owner.address)).to.equal(totalSupply - amount);
    expect(await dgvcProxy.balanceOf(user.address)).to.equal(amount - (amount * BURN_FEE / HUNDRED_PERCENT));
    expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(0);

    expect(await dgvcProxy.totalSupply()).to.equal(totalSupply - (amount * BURN_FEE / HUNDRED_PERCENT));
  });

  it('should be possible to do a regular transfer of 1000 DGVC to the own address for a user with common fee / burn', async () => {
    const amount = utils.parseUnits('1000', baseUnit).toBigInt();

    expect(await dgvcProxy.commonBurnFee()).to.equal(0);
    expect(await dgvcProxy.commonFotFee()).to.equal(0);

    await dgvcProxy.setCommonFee(PART_FEE);
    await dgvcProxy.setBurnFee(PART_FEE);

    expect(await dgvcProxy.commonBurnFee()).to.equal(PART_FEE);
    expect(await dgvcProxy.commonFotFee()).to.equal(PART_FEE);

    await dgvcProxy.setFeeReceiver(feeReceiver.address);

    expect(await dgvcProxy.balanceOf(owner.address)).to.equal(totalSupply);
    expect(await dgvcProxy.balanceOf(user.address)).to.equal(0);
    expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(0);
    expect(await dgvcProxy.actualBurnCycle()).to.equal(0);
    expect(await dgvcProxy.totalBurn()).to.equal(0);

    await dgvcProxy.transfer(owner.address, amount);

    expect(await dgvcProxy.actualBurnCycle()).to.equal(amount * PART_FEE / HUNDRED_PERCENT);
    expect(await dgvcProxy.totalBurn()).to.equal(amount * PART_FEE / HUNDRED_PERCENT);

    expect(await dgvcProxy.balanceOf(owner.address)).to.equal(totalSupply - (amount * FEE /HUNDRED_PERCENT));
    expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(amount * PART_FEE / HUNDRED_PERCENT);

    expect(await dgvcProxy.totalSupply()).to.equal(totalSupply - (amount * PART_FEE / HUNDRED_PERCENT));
  });

  it('should be possible to do a transferFrom of 1000 DGVC from user to user2 with common fee / burn', async () => {
    const COMMON_FOT_FEE = 500n;
    const COMMON_BURN_FEE = 300n;
    const amount = utils.parseUnits('1000', baseUnit).toBigInt();

    await dgvcProxy.setCommonFee(COMMON_FOT_FEE);
    await dgvcProxy.setBurnFee(COMMON_BURN_FEE);

    expect(await dgvcProxy.commonBurnFee()).to.equal(COMMON_BURN_FEE);
    expect(await dgvcProxy.commonFotFee()).to.equal(COMMON_FOT_FEE);

    await dgvcProxy.setFeeReceiver(feeReceiver.address);

    await dgvcProxy.transfer(user.address, amount);

    expect(await dgvcProxy.actualBurnCycle()).to.equal(amount * COMMON_BURN_FEE / HUNDRED_PERCENT);
    expect(await dgvcProxy.totalBurn()).to.equal(amount * COMMON_BURN_FEE / HUNDRED_PERCENT);

    expect(await dgvcProxy.balanceOf(owner.address)).to.equal(totalSupply - amount);
    expect(await dgvcProxy.balanceOf(user.address)).to.equal(amount - (amount * (COMMON_FOT_FEE + COMMON_BURN_FEE) / HUNDRED_PERCENT));
    expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(amount * COMMON_FOT_FEE / HUNDRED_PERCENT);

    expect(await dgvcProxy.totalSupply()).to.equal(totalSupply - (amount * COMMON_BURN_FEE / HUNDRED_PERCENT));

    const userBalance = BNtoBigInt(await dgvcProxy.balanceOf(user.address));
    const feeReceiverBalance = BNtoBigInt(await dgvcProxy.balanceOf(feeReceiver.address));
    const totalSupplyAfter = BNtoBigInt(await dgvcProxy.totalSupply());

    await dgvcProxy.connect(user).approve(owner.address, userBalance);

    expect(await dgvcProxy.balanceOf(userTwo.address)).to.equal(0);
    expect(await dgvcProxy.allowance(user.address, owner.address)).to.equal(userBalance);

    await dgvcProxy.transferFrom(user.address, userTwo.address, userBalance);

    expect(await dgvcProxy.allowance(user.address, owner.address)).to.equal(0);
    expect(await dgvcProxy.balanceOf(userTwo.address)).to.equal(userBalance - (userBalance * (COMMON_FOT_FEE + COMMON_BURN_FEE) / HUNDRED_PERCENT));
    expect(await dgvcProxy.totalSupply()).to.equal(totalSupplyAfter - (userBalance * COMMON_BURN_FEE / HUNDRED_PERCENT));
    expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(feeReceiverBalance + userBalance * COMMON_FOT_FEE / HUNDRED_PERCENT);
  });

  it('should be possible to do a transferFrom of 1000 DGVC from user to user2 with custom fee / burn', async () => {
    const COMMON_FOT_FEE = 500n;
    const COMMON_BURN_FEE = 300n;
    const CUSTOM_FOT_FEE = 400n;
    const CUSTOM_BURN_FEE = 200n;
    const amount = utils.parseUnits('1000', baseUnit).toBigInt();

    await dgvcProxy.setCommonFee(COMMON_FOT_FEE);
    await dgvcProxy.setBurnFee(COMMON_BURN_FEE);

    await dgvcProxy.setUserCustomFee(user.address, CUSTOM_FOT_FEE, CUSTOM_BURN_FEE);

    await dgvcProxy.setFeeReceiver(feeReceiver.address);

    await dgvcProxy.transfer(user.address, amount);

    expect(await dgvcProxy.actualBurnCycle()).to.equal(amount * COMMON_BURN_FEE / HUNDRED_PERCENT);
    expect(await dgvcProxy.totalBurn()).to.equal(amount * COMMON_BURN_FEE / HUNDRED_PERCENT);

    expect(await dgvcProxy.balanceOf(owner.address)).to.equal(totalSupply - amount);
    expect(await dgvcProxy.balanceOf(user.address)).to.equal(amount - (amount * (COMMON_FOT_FEE + COMMON_BURN_FEE) / HUNDRED_PERCENT));
    expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(amount * COMMON_FOT_FEE / HUNDRED_PERCENT);

    expect(await dgvcProxy.totalSupply()).to.equal(totalSupply - (amount * COMMON_BURN_FEE / HUNDRED_PERCENT));

    const userBalance = BNtoBigInt(await dgvcProxy.balanceOf(user.address));
    const feeReceiverBalance = BNtoBigInt(await dgvcProxy.balanceOf(feeReceiver.address));
    const totalSupplyAfter = BNtoBigInt(await dgvcProxy.totalSupply());

    await dgvcProxy.connect(user).approve(owner.address, userBalance);

    expect(await dgvcProxy.balanceOf(userTwo.address)).to.equal(0);
    expect(await dgvcProxy.allowance(user.address, owner.address)).to.equal(userBalance);

    await dgvcProxy.transferFrom(user.address, userTwo.address, userBalance);

    expect(await dgvcProxy.allowance(user.address, owner.address)).to.equal(0);
    expect(await dgvcProxy.balanceOf(userTwo.address)).to.equal(userBalance - (userBalance * (CUSTOM_FOT_FEE + CUSTOM_BURN_FEE) / HUNDRED_PERCENT));
    expect(await dgvcProxy.totalSupply()).to.equal(totalSupplyAfter - (userBalance * CUSTOM_BURN_FEE / HUNDRED_PERCENT));
    expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(feeReceiverBalance + userBalance * CUSTOM_FOT_FEE / HUNDRED_PERCENT);
  });

});