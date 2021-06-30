const Ganache = require('./helpers/ganache');
const { BigNumber, utils } = require('ethers');
const { expect } = require('chai');
const assert = require('assert');

describe('DGVC Custom Transfers', function() {
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

  beforeEach('setup others', async function() {
    accounts = await ethers.getSigners();
    owner = accounts[0];
    user = accounts[1];
    feeReceiver = accounts[2];
    userTwo = accounts[3];
    afterEach('revert', function() { return ganache.revert(); });

    const DGVC = await ethers.getContractFactory('DGVC');
    dgvc = await DGVC.deploy(ROUTER);
    await dgvc.deployed();

    await dgvc.setRebaseDelta(rebaseDelta);
    await dgvc.setBurnCycle(burnCycle)

    await ganache.snapshot();
  });

  // User has customFee. custom burn. Transfers 1000 tokens, Check burn cycle increased, total supply decreased. Custom fees applied.
  it.only('should be possible to do a custom transfer of 1000 DGVC for a user with custom fee / burn', async function () {
    const amount = utils.parseUnits('1000', baseUnit).toBigInt();

    const customFeesBefore = await dgvc.customFees(user.address);
    const customFeeBefore = customFeesBefore[1];
    const customBurnBefore = customFeesBefore[2];

    expect(customFeeBefore).to.equal(0);
    expect(customBurnBefore).to.equal(0);

    await dgvc.setUserCustomFee(user.address, FEE, PART_FEE);

    const customFeesAfter = await dgvc.customFees(user.address);
    const customFeeAfter = customFeesAfter[1];
    const customBurnAfter = customFeesAfter[2];

    expect(customFeeAfter).to.equal(BigInttoBN(FEE));
    expect(customBurnAfter).to.equal(BigInttoBN(PART_FEE));

    await dgvc.setFeeReceiver(feeReceiver.address);

    expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply);
    expect(await dgvc.balanceOf(user.address)).to.equal(0);
    expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(0);
    expect(await dgvc.actualBurnCycle()).to.equal(0);
    expect(await dgvc.totalBurn()).to.equal(0);

    await dgvc.transfer(user.address, amount);
    await dgvc.connect(user).transfer(userTwo.address, amount);

    expect(await dgvc.actualBurnCycle()).to.equal(amount * PART_FEE / HUNDRED_PERCENT);
    expect(await dgvc.totalBurn()).to.equal(amount * PART_FEE / HUNDRED_PERCENT);

    expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply - amount);

    expect(await dgvc.balanceOf(userTwo.address)).to.equal(amount - (amount * FEE / HUNDRED_PERCENT) - (amount * PART_FEE / HUNDRED_PERCENT));
    expect(await dgvc.balanceOf(feeReceiver.address), amount * PART_FEE / HUNDRED_PERCENT);

    expect(await dgvc.totalSupply()).to.equal(totalSupply - (amount * PART_FEE / HUNDRED_PERCENT));
  });
});