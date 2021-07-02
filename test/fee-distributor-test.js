const Ganache = require('./helpers/ganache');
const assert = require('assert');
const { BigNumber, utils } = require('ethers');
const { expect } = require('chai');

describe('FeeDistributor', function() {
  const BNtoBigInt = (input) => BigInt(input.toString());
  const BigInttoBN = (input) => BigNumber.from(input.toString());

  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
  const ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
  
  const HUNDRED_PERCENT = 100n;
  const liquidVaultShare = 60n;
  const burnPercentage = 10n;

  const ganache = new Ganache();
  const baseUnit = 18;

  let accounts;
  let feeDistributor;
  let owner;
  let user;
  let feeReceiver;
  let userTwo;
  let dgvc;
  let vaultFake;

  before('setup others', async function() {
    accounts = await ethers.getSigners();
    owner = accounts[0];
    user = accounts[1];
    feeReceiver = accounts[2];
    userTwo = accounts[3];
    vaultFake = accounts[4];

    const FeeDistributor = await ethers.getContractFactory('FeeDistributor');
    feeDistributor = await FeeDistributor.deploy();

    const DGVC = await ethers.getContractFactory('DGVC');
    dgvc = await DGVC.deploy(ROUTER);

    await ganache.snapshot();
  });

  afterEach('revert', function() { return ganache.revert(); });

  it('should be possible to change ownership', async function() {
    expect(await feeDistributor.owner()).to.equal(owner.address);

    const newOwner = accounts[1];
    await feeDistributor.transferOwnership(newOwner.address);

    expect(await feeDistributor.owner()).to.equal(newOwner.address);
  });

  it('should be possible to seed', async function() {
    const recipientsBefore = await feeDistributor.recipients();

    expect(await feeDistributor.dgvc()).to.equal(ZERO_ADDRESS);
    expect(await feeDistributor.initialized()).to.equal(false);
    expect(recipientsBefore.liquidVault).to.equal(ZERO_ADDRESS);
    expect(recipientsBefore.secondaryAddress).to.equal(ZERO_ADDRESS);
    expect(recipientsBefore.liquidVaultShare).to.equal(0);
    expect(recipientsBefore.burnPercentage).to.equal(0);

    await feeDistributor.seed(
      dgvc.address, 
      vaultFake.address, 
      feeReceiver.address,
      liquidVaultShare,
      burnPercentage
    );

    const recipientsAfter = await feeDistributor.recipients();

    expect(await feeDistributor.dgvc()).to.equal(dgvc.address);
    expect(await feeDistributor.initialized()).to.equal(true);
    expect(recipientsAfter.liquidVault).to.equal(vaultFake.address);
    expect(recipientsAfter.secondaryAddress).to.equal(feeReceiver.address);
    expect(recipientsAfter.liquidVaultShare).to.equal(liquidVaultShare);
    expect(recipientsAfter.burnPercentage).to.equal(burnPercentage);
  });

  it('should be possible to seed more than one time', async function() {
    const vaultNew = accounts[3];
    const userNew = accounts[5];
    const tokenNew = accounts[6];

    const liquidVaultShareNew = 70;
    const burnPercentageNew = 5;

    await feeDistributor.seed(
      dgvc.address, 
      vaultFake.address, 
      feeReceiver.address,
      liquidVaultShare,
      burnPercentage
    );

    const recipientsBefore = await feeDistributor.recipients();

    expect(await feeDistributor.dgvc()).to.equal(dgvc.address);
    expect(await feeDistributor.initialized()).to.equal(true);
    expect(recipientsBefore.liquidVault).to.equal(vaultFake.address);
    expect(recipientsBefore.secondaryAddress).to.equal(feeReceiver.address);
    expect(recipientsBefore.liquidVaultShare).to.equal(liquidVaultShare);
    expect(recipientsBefore.burnPercentage).to.equal(burnPercentage);

    await feeDistributor.seed(
      tokenNew.address, 
      vaultNew.address, 
      userNew.address,
      liquidVaultShareNew,
      burnPercentageNew
    );

    const recipientsAfter = await feeDistributor.recipients();

    expect(await feeDistributor.dgvc()).to.equal(tokenNew.address);
    expect(await feeDistributor.initialized()).to.equal(true);
    expect(recipientsAfter.liquidVault).to.equal(vaultNew.address);
    expect(recipientsAfter.secondaryAddress).to.equal(userNew.address);
    expect(recipientsAfter.liquidVaultShare).to.equal(liquidVaultShareNew);
    expect(recipientsAfter.burnPercentage).to.equal(burnPercentageNew);
  });

  it('should revert seed() if caller is not the owner', async function() {
    await expect(feeDistributor.connect(user).seed(
      dgvc.address, 
      vaultFake.address, 
      user.address, 
      liquidVaultShare, 
      burnPercentage
    )).to.be.revertedWith('Ownable: caller is not the owner');
  });

  it('should distribute fees according to seeded parameters', async function() {
    const distributeAmount = utils.parseUnits('10000', baseUnit).toBigInt();
    await feeDistributor.seed(
      dgvc.address, 
      vaultFake.address, 
      feeReceiver.address,
      liquidVaultShare,
      burnPercentage
    );

    await dgvc.setFeeReceiver(feeDistributor.address);
    await dgvc.transfer(feeDistributor.address, distributeAmount);
    expect(await dgvc.balanceOf(feeDistributor.address)).to.equal(distributeAmount);

    await feeDistributor.distributeFees();
    const expectedVaultBalance = liquidVaultShare * distributeAmount / HUNDRED_PERCENT;
    const expectedBurnPercentage = burnPercentage * distributeAmount / HUNDRED_PERCENT;
    const expectedSecondaryAddress = distributeAmount - expectedBurnPercentage - expectedVaultBalance;

    expect(await dgvc.balanceOf(vaultFake.address)).to.equal(expectedVaultBalance);
    expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(expectedSecondaryAddress);
  });
});