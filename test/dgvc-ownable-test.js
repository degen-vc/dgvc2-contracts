const Ganache = require('./helpers/ganache');
const assert = require('assert');
const { BigNumber, utils } = require('ethers');
const { expect } = require('chai');

  describe('DGVC Ownable', function() {
    const BNtoBigInt = (input) => BigInt(input.toString());
    const BigInttoBN = (input) => BigNumber.from(input.toString());

    const router = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
    const ganache = new Ganache();
    const baseUnit = 18;
    const totalSupply = utils.parseUnits('12000000', baseUnit).toBigInt();
    const burnCycle = utils.parseUnits('5000', baseUnit).toBigInt();
    const rebaseDelta = utils.parseUnits('4000', baseUnit).toBigInt();

    const CUSTOM_FOT_FEE = 500n;
    const CUSTOM_BURN_FEE = 250n;
    const DEX_BURN_FEE = 150n;

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
      
      const DGVC = await ethers.getContractFactory('DGVC');
      dgvc = await DGVC.deploy(router);
      await dgvc.deployed();

      await dgvc.setRebaseDelta(rebaseDelta);
      await dgvc.setBurnCycle(burnCycle)

      await ganache.snapshot();
    });

    afterEach('revert', function() { return ganache.revert(); });

    it('should revert setFeeReceiver() if caller is not the owner', async function() {
      await expect(
        dgvc.connect(user).setFeeReceiver(userTwo.address)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should revert excludeAccount() if caller is not the owner', async function() {
      await expect(
        dgvc.connect(user).excludeAccount(owner.address)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should revert includeAccount() if caller is not the owner', async function() {
      await expect(
        dgvc.connect(user).includeAccount(user.address)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should revert setUserCustomFee() if caller is not the owner', async function() {
      await expect(
        dgvc.connect(user).setUserCustomFee(userTwo.address, CUSTOM_FOT_FEE, CUSTOM_BURN_FEE)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should revert setDexFee() if caller is not the owner', async function() {
      await expect(
        dgvc.connect(user).setDexFee(userTwo.address, CUSTOM_FOT_FEE, CUSTOM_BURN_FEE, DEX_BURN_FEE)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should revert setCommonFee() if caller is not the owner', async function() {
      await expect(
        dgvc.connect(user).setCommonFee(CUSTOM_FOT_FEE)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should revert setBurnFee() if caller is not the owner', async function() {
      await expect(
        dgvc.connect(user).setBurnFee(CUSTOM_BURN_FEE)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should revert setBurnCycle() if caller is not the owner', async function() {
      await expect(
        dgvc.connect(user).setBurnCycle(burnCycle)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should revert setRebaseDelta() if caller is not the owner', async function() {
      await expect(
        dgvc.connect(user).setRebaseDelta(rebaseDelta)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });
