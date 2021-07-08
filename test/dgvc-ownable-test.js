const Ganache = require('./helpers/ganache');
const { BigNumber, utils } = require('ethers');
const { expect, assert } = require('chai');
// const assert = require('assert');

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
    const DEX_SELL_FEE = 600n;
    const DEX_BUY_FEE = 400n;
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

    it('should be set feeRaceiver by owner', async function() {
      assert.notStrictEqual(await dgvc.feeReceiver(), user.address);

      await expect(dgvc.setFeeReceiver(user.address));

      assert.strictEqual(await dgvc.feeReceiver(), user.address);
    });

    it('should revert excludeAccount() if caller is not the owner', async function() {
      await expect(
        dgvc.connect(user).excludeAccount(owner.address)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should be set excluded account by owner', async function() {
      assert.isNotTrue(await dgvc.isExcluded(user.address));

      await expect(dgvc.excludeAccount(user.address));
      
      assert.isTrue(await dgvc.isExcluded(user.address));
    });

    it('should revert includeAccount() if caller is not the owner', async function() {
      await expect(
        dgvc.connect(user).includeAccount(user.address)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should be set included account by owner', async function() {
      assert.isNotTrue(await dgvc.isExcluded(user.address));

      await expect(dgvc.excludeAccount(user.address));
      assert.isTrue(await dgvc.isExcluded(user.address));

      await expect(dgvc.includeAccount(user.address));    
      assert.isNotTrue(await dgvc.isExcluded(user.address));
    });

    it('should revert setUserCustomFee() if caller is not the owner', async function() {
      await expect(
        dgvc.connect(user).setUserCustomFee(userTwo.address, CUSTOM_FOT_FEE, CUSTOM_BURN_FEE)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should be set Custom Fees by owner', async function() {
      const { enabled: userAddressBefore, fot: customFeeBefore, burn: customBurnBefore } = await dgvc.customFees(user.address);

      assert.isNotTrue(userAddressBefore);
      expect(customFeeBefore).to.be.equal(BigInttoBN(0));
      expect(customBurnBefore).to.be.equal(BigInttoBN(0));

      await dgvc.setUserCustomFee(user.address, CUSTOM_FOT_FEE, CUSTOM_BURN_FEE);

      const { enabled: userAddressAfter, fot: customFeeAfter, burn: customBurnAfter } = await dgvc.customFees(user.address);

      assert.isTrue(userAddressAfter);
      expect(customFeeAfter).to.be.equal(BigInttoBN(CUSTOM_FOT_FEE));
      expect(customBurnAfter).to.be.equal(BigInttoBN(CUSTOM_BURN_FEE));
    });

    it('should revert setDexFee() if caller is not the owner', async function() {
      await expect(
        dgvc.connect(user).setDexFee(userTwo.address, CUSTOM_FOT_FEE, CUSTOM_BURN_FEE, DEX_BURN_FEE)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should be set Dex FOT by owner', async function() {
      const { enabled: userAddressBefore, buy: dexBuyBefore, sell: dexSellBefore, burn: dexBurnBefore } = await dgvc.dexFOT(user.address);

      assert.isNotTrue(userAddressBefore);
      expect(dexBuyBefore).to.be.equal(BigInttoBN(0));
      expect(dexSellBefore).to.be.equal(BigInttoBN(0));
      expect(dexBurnBefore).to.be.equal(BigInttoBN(0));

      await dgvc.setDexFee(user.address, DEX_BUY_FEE, DEX_SELL_FEE, DEX_BURN_FEE);

      const { enabled: userAddressAfter, buy: dexBuyAfter, sell: dexSellAfter, burn: dexBurnAfter } = await dgvc.dexFOT(user.address);

      assert.isTrue(userAddressAfter);
      expect(dexBuyAfter).to.be.equal(BigInttoBN(DEX_BUY_FEE));
      expect(dexSellAfter).to.be.equal(BigInttoBN(DEX_SELL_FEE));
      expect(dexBurnAfter).to.be.equal(BigInttoBN(DEX_BURN_FEE));
    });

    it('should revert setCommonFee() if caller is not the owner', async function() {
      await expect(
        dgvc.connect(user).setCommonFee(CUSTOM_FOT_FEE)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should be set Common Fot Fee by owner', async function() {
      expect(await dgvc.commonFotFee()).to.be.equal(0);

      await dgvc.setCommonFee(CUSTOM_FOT_FEE);

      expect(await dgvc.commonFotFee()).to.be.equal(CUSTOM_FOT_FEE);
    });

    it('should revert setBurnFee() if caller is not the owner', async function() {
      await expect(
        dgvc.connect(user).setBurnFee(CUSTOM_BURN_FEE)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should be set Common Burn Fee by owner', async function() {
      expect(await dgvc.commonBurnFee()).to.be.equal(0);

      await dgvc.setBurnFee(CUSTOM_BURN_FEE);

      expect(await dgvc.commonBurnFee()).to.be.equal(CUSTOM_BURN_FEE);
    });

    it('should revert setBurnCycle() if caller is not the owner', async function() {
      await expect(
        dgvc.connect(user).setBurnCycle(burnCycle)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should be set Burn Cycle Limit by owner', async function() {
      const burnCycleLimit = utils.parseUnits('7000', baseUnit).toBigInt();

      expect(await dgvc.burnCycleLimit()).to.be.equal(burnCycle);

      await dgvc.setBurnCycle(burnCycleLimit);

      expect(await dgvc.burnCycleLimit()).to.be.equal(burnCycleLimit);
    });

    it('should revert setRebaseDelta() if caller is not the owner', async function() {
      await expect(
        dgvc.connect(user).setRebaseDelta(rebaseDelta)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should be set Rebase Delta by owner', async function() {
      const _rebaseDelta = utils.parseUnits('5000', baseUnit).toBigInt();
      
      expect(await dgvc.rebaseDelta()).to.be.equal(rebaseDelta);

      await dgvc.setRebaseDelta(_rebaseDelta);

      expect(await dgvc.rebaseDelta()).to.be.equal(_rebaseDelta);
    });
  });
