const Ganache = require('./helpers/ganache');
const { BigNumber, utils } = require('ethers');
const { expect, assert } = require('chai');
// const assert = require('assert');

  describe('DGVC Ownable', function() {
    const BNtoBigInt = (input) => BigInt(input.toString());
    const BigInttoBN = (input) => BigNumber.from(input.toString());

    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
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
    let dgvcProxy;
    let dgvcImplementation;
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

      const DGVCImplementation = await ethers.getContractFactory('DGVCImplementation');
      dgvcImplementation = await DGVCImplementation.deploy();
      await dgvcImplementation.deployed();

      //lock implementation
      await dgvcImplementation.init(router);
      await dgvcImplementation.renounceOwnership();

      //setup proxy
      const DGVCProxy = await ethers.getContractFactory('DGVCProxy');
      dgvcProxy = await DGVCProxy.deploy();
      await dgvcProxy.deployed();

      await dgvcProxy.setImplementation(dgvcImplementation.address);

      dgvcProxy = new ethers.Contract(dgvcProxy.address, DGVCImplementation.interface, owner);
      await dgvcProxy.init(router);


      await dgvcProxy.setRebaseDelta(rebaseDelta);
      await dgvcProxy.setBurnCycle(burnCycle)

      await ganache.snapshot();
    });

    afterEach('revert', function() { return ganache.revert(); });

    it('should revert setFeeReceiver() if caller is not the owner', async function() {
      await expect(
        dgvcProxy.connect(user).setFeeReceiver(userTwo.address)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should be possible to set feeReceiver by owner', async function() {
      assert.equal(await dgvcProxy.feeReceiver(), ZERO_ADDRESS);

      await expect(dgvcProxy.setFeeReceiver(user.address));

      assert.equal(await dgvcProxy.feeReceiver(), user.address);
    });

    it('should revert excludeAccount() if caller is not the owner', async function() {
      await expect(
        dgvcProxy.connect(user).excludeAccount(owner.address)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should be possible to set excluded account by owner', async function() {
      assert.isFalse(await dgvcProxy.isExcluded(user.address));

      await expect(dgvcProxy.excludeAccount(user.address));
      
      assert.isTrue(await dgvcProxy.isExcluded(user.address));
    });

    it('should revert includeAccount() if caller is not the owner', async function() {
      await expect(
        dgvcProxy.connect(user).includeAccount(user.address)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should be possible to set included account by owner', async function() {
      assert.isFalse(await dgvcProxy.isExcluded(user.address));

      await expect(dgvcProxy.excludeAccount(user.address));
      assert.isTrue(await dgvcProxy.isExcluded(user.address));

      await expect(dgvcProxy.includeAccount(user.address));    
      assert.isFalse(await dgvcProxy.isExcluded(user.address));
    });

    it('should revert setUserCustomFee() if caller is not the owner', async function() {
      await expect(
        dgvcProxy.connect(user).setUserCustomFee(userTwo.address, CUSTOM_FOT_FEE, CUSTOM_BURN_FEE)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should be possible to set Custom Fees by owner', async function() {
      const { enabled: userAddressBefore, fot: customFeeBefore, burn: customBurnBefore } = await dgvcProxy.customFees(user.address);

      assert.isFalse(userAddressBefore);
      expect(customFeeBefore).to.be.equal(BigInttoBN(0));
      expect(customBurnBefore).to.be.equal(BigInttoBN(0));

      await dgvcProxy.setUserCustomFee(user.address, CUSTOM_FOT_FEE, CUSTOM_BURN_FEE);

      const { enabled: userAddressAfter, fot: customFeeAfter, burn: customBurnAfter } = await dgvcProxy.customFees(user.address);

      assert.isTrue(userAddressAfter);
      expect(customFeeAfter).to.be.equal(BigInttoBN(CUSTOM_FOT_FEE));
      expect(customBurnAfter).to.be.equal(BigInttoBN(CUSTOM_BURN_FEE));
    });

    it('should revert setDexFee() if caller is not the owner', async function() {
      await expect(
        dgvcProxy.connect(user).setDexFee(userTwo.address, CUSTOM_FOT_FEE, CUSTOM_BURN_FEE, DEX_BURN_FEE)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should be possible to set Dex FOT by owner', async function() {
      const { enabled: userAddressBefore, buy: dexBuyBefore, sell: dexSellBefore, burn: dexBurnBefore } = await dgvcProxy.dexFOT(user.address);

      assert.isFalse(userAddressBefore);
      expect(dexBuyBefore).to.be.equal(BigInttoBN(0));
      expect(dexSellBefore).to.be.equal(BigInttoBN(0));
      expect(dexBurnBefore).to.be.equal(BigInttoBN(0));

      await dgvcProxy.setDexFee(user.address, DEX_BUY_FEE, DEX_SELL_FEE, DEX_BURN_FEE);

      const { enabled: userAddressAfter, buy: dexBuyAfter, sell: dexSellAfter, burn: dexBurnAfter } = await dgvcProxy.dexFOT(user.address);

      assert.isTrue(userAddressAfter);
      expect(dexBuyAfter).to.be.equal(BigInttoBN(DEX_BUY_FEE));
      expect(dexSellAfter).to.be.equal(BigInttoBN(DEX_SELL_FEE));
      expect(dexBurnAfter).to.be.equal(BigInttoBN(DEX_BURN_FEE));
    });

    it('should revert setCommonFee() if caller is not the owner', async function() {
      await expect(
        dgvcProxy.connect(user).setCommonFee(CUSTOM_FOT_FEE)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should be possible to set Common Fot Fee by owner', async function() {
      expect(await dgvcProxy.commonFotFee()).to.be.equal(0);

      await dgvcProxy.setCommonFee(CUSTOM_FOT_FEE);

      expect(await dgvcProxy.commonFotFee()).to.be.equal(CUSTOM_FOT_FEE);
    });

    it('should revert setBurnFee() if caller is not the owner', async function() {
      await expect(
        dgvcProxy.connect(user).setBurnFee(CUSTOM_BURN_FEE)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should be possible to set Common Burn Fee by owner', async function() {
      expect(await dgvcProxy.commonBurnFee()).to.be.equal(0);

      await dgvcProxy.setBurnFee(CUSTOM_BURN_FEE);

      expect(await dgvcProxy.commonBurnFee()).to.be.equal(CUSTOM_BURN_FEE);
    });

    it('should revert setBurnCycle() if caller is not the owner', async function() {
      await expect(
        dgvcProxy.connect(user).setBurnCycle(burnCycle)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should be possible to set Burn Cycle Limit by owner', async function() {
      const burnCycleLimit = utils.parseUnits('7000', baseUnit).toBigInt();

      expect(await dgvcProxy.burnCycleLimit()).to.be.equal(burnCycle);

      await dgvcProxy.setBurnCycle(burnCycleLimit);

      expect(await dgvcProxy.burnCycleLimit()).to.be.equal(burnCycleLimit);
    });

    it('should revert setRebaseDelta() if caller is not the owner', async function() {
      await expect(
        dgvcProxy.connect(user).setRebaseDelta(rebaseDelta)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should be possible to set Rebase Delta by owner', async function() {
      const _rebaseDelta = utils.parseUnits('5000', baseUnit).toBigInt();
      
      expect(await dgvcProxy.rebaseDelta()).to.be.equal(rebaseDelta);

      await dgvcProxy.setRebaseDelta(_rebaseDelta);

      expect(await dgvcProxy.rebaseDelta()).to.be.equal(_rebaseDelta);
    });
  });
