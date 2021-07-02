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
  let dgvc;
  let owner;
  let user;
  let feeReceiver;
  let userTwo;

  before('setup others', async function() {
    accounts = await ethers.getSigners();
    owner = accounts[0];
    user = accounts[1];
    feeReceiver = accounts[2];
    userTwo = accounts[3];

    const DGVC = await ethers.getContractFactory('DGVC');
    dgvc = await DGVC.deploy(ROUTER);
    await dgvc.deployed();

    await dgvc.setRebaseDelta(rebaseDelta);
    await dgvc.setBurnCycle(burnCycle)

    await ganache.snapshot();
  });

  afterEach('revert', function() { return ganache.revert(); });

  it('should be possible to do a regular transfer of 1000 DGVC for a user with common fee / burn', async function () {
    const amount = utils.parseUnits('1000', baseUnit).toBigInt();

    expect(await dgvc.commonBurnFee()).to.equal(0);
    expect(await dgvc.commonFotFee()).to.equal(0);

    await dgvc.setCommonFee(PART_FEE);
    await dgvc.setBurnFee(PART_FEE);

    expect(await dgvc.commonBurnFee()).to.equal(PART_FEE);
    expect(await dgvc.commonFotFee()).to.equal(PART_FEE);

    await dgvc.setFeeReceiver(feeReceiver.address);

    expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply);
    expect(await dgvc.balanceOf(user.address)).to.equal(0);
    expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(0);
    expect(await dgvc.actualBurnCycle()).to.equal(0);
    expect(await dgvc.totalBurn()).to.equal(0);

    await dgvc.transfer(user.address, amount);

    expect(await dgvc.actualBurnCycle()).to.equal(amount * PART_FEE / HUNDRED_PERCENT);
    expect(await dgvc.totalBurn()).to.equal(amount * PART_FEE / HUNDRED_PERCENT);

    expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply - amount);
    expect(await dgvc.balanceOf(user.address)).to.equal(amount - (amount * FEE /HUNDRED_PERCENT));
    expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(amount * PART_FEE / HUNDRED_PERCENT);

    expect(await dgvc.totalSupply()).to.equal(totalSupply - (amount * PART_FEE / HUNDRED_PERCENT));
  });

  it('should be possible to do a regular transfer of 1000 DGVC for a user with 0% common fee / burn', async function () {
    const amount = utils.parseUnits('1000', baseUnit).toBigInt();

    expect(await dgvc.commonBurnFee()).to.equal(0);
    expect(await dgvc.commonFotFee()).to.equal(0);

    await dgvc.setFeeReceiver(feeReceiver.address);

    expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply);
    expect(await dgvc.balanceOf(user.address)).to.equal(0);
    expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(0);
    expect(await dgvc.actualBurnCycle()).to.equal(0);
    expect(await dgvc.totalBurn()).to.equal(0);

    await dgvc.transfer(user.address, amount);

    expect(await dgvc.actualBurnCycle()).to.equal(0);
    expect(await dgvc.totalBurn()).to.equal(0);

    expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply - amount);
    expect(await dgvc.balanceOf(user.address)).to.equal(amount);
    expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(0);

    expect(await dgvc.totalSupply()).to.equal(totalSupply);
  });

  it('should be possible to do a regular transfer with common fee 2% and burn 0%', async function() {
    const COMMON_FEE = 200n;
    const amount = utils.parseUnits('1000', baseUnit).toBigInt();

    await dgvc.setCommonFee(COMMON_FEE);

    expect(await dgvc.commonBurnFee()).to.equal(0);
    expect(await dgvc.commonFotFee()).to.equal(COMMON_FEE);

    await dgvc.setFeeReceiver(feeReceiver.address);

    expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply);
    expect(await dgvc.balanceOf(user.address)).to.equal(0);
    expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(0);
    expect(await dgvc.actualBurnCycle()).to.equal(0);
    expect(await dgvc.totalBurn()).to.equal(0);

    await dgvc.transfer(user.address, amount);

    expect(await dgvc.actualBurnCycle()).to.equal(0);
    expect(await dgvc.totalBurn()).to.equal(0);

    expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply - amount);
    expect(await dgvc.balanceOf(user.address)).to.equal(amount - (amount * COMMON_FEE /HUNDRED_PERCENT));
    expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(amount * COMMON_FEE / HUNDRED_PERCENT);

    expect(await dgvc.totalSupply()).to.equal(totalSupply);
  });

  it('should be possible to do a regular transfer with common fee 0% and burn 3%', async function() {
    const amount = utils.parseUnits('1000', baseUnit).toBigInt();
    const BURN_FEE = 300n;

    expect(await dgvc.commonBurnFee()).to.equal(0);
    expect(await dgvc.commonFotFee()).to.equal(0);

    await dgvc.setBurnFee(BURN_FEE);

    expect(await dgvc.commonBurnFee()).to.equal(BURN_FEE);

    await dgvc.setFeeReceiver(feeReceiver.address);

    expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply);
    expect(await dgvc.balanceOf(user.address)).to.equal(0);
    expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(0);
    expect(await dgvc.actualBurnCycle()).to.equal(0);
    expect(await dgvc.totalBurn()).to.equal(0);

    await dgvc.transfer(user.address, amount);

    expect(await dgvc.actualBurnCycle()).to.equal(amount * BURN_FEE / HUNDRED_PERCENT);
    expect(await dgvc.totalBurn()).to.equal(amount * BURN_FEE / HUNDRED_PERCENT);

    expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply - amount);
    expect(await dgvc.balanceOf(user.address)).to.equal(amount - (amount * BURN_FEE / HUNDRED_PERCENT));
    expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(0);

    expect(await dgvc.totalSupply()).to.equal(totalSupply - (amount * BURN_FEE / HUNDRED_PERCENT));
  });

  it('should be possible to do a regular transfer of 1000 DGVC to the own address for a user with common fee / burn', async function () {
    const amount = utils.parseUnits('1000', baseUnit).toBigInt();

    expect(await dgvc.commonBurnFee()).to.equal(0);
    expect(await dgvc.commonFotFee()).to.equal(0);

    await dgvc.setCommonFee(PART_FEE);
    await dgvc.setBurnFee(PART_FEE);

    expect(await dgvc.commonBurnFee()).to.equal(PART_FEE);
    expect(await dgvc.commonFotFee()).to.equal(PART_FEE);

    await dgvc.setFeeReceiver(feeReceiver.address);

    expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply);
    expect(await dgvc.balanceOf(user.address)).to.equal(0);
    expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(0);
    expect(await dgvc.actualBurnCycle()).to.equal(0);
    expect(await dgvc.totalBurn()).to.equal(0);

    await dgvc.transfer(owner.address, amount);

    expect(await dgvc.actualBurnCycle()).to.equal(amount * PART_FEE / HUNDRED_PERCENT);
    expect(await dgvc.totalBurn()).to.equal(amount * PART_FEE / HUNDRED_PERCENT);

    expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply - (amount * FEE /HUNDRED_PERCENT));
    expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(amount * PART_FEE / HUNDRED_PERCENT);

    expect(await dgvc.totalSupply()).to.equal(totalSupply - (amount * PART_FEE / HUNDRED_PERCENT));
  });
});