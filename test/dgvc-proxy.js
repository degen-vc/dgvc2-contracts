const Ganache = require('./helpers/ganache');
const { BigNumber, utils } = require('ethers');
const { expect, assert } = require('chai');

  describe('DGVC Proxy', function() {

    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
    const router = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
    const ganache = new Ganache();
    const baseUnit = 18;
    const burnCycle = utils.parseUnits('5000', baseUnit).toBigInt();
    const rebaseDelta = utils.parseUnits('4000', baseUnit).toBigInt();

    let accounts;
    let dgvcProxy;
    let dgvcImplementation;
    let owner;
    let user;
    let feeReceiver;
    let userTwo;
    let implementationFake;
    let DGVCImplementation;

    beforeEach('setup others', async function() {
      accounts = await ethers.getSigners();
      owner = accounts[0];
      user = accounts[1];
      feeReceiver = accounts[2];
      userTwo = accounts[3];
      implementationFake = accounts[4];

      DGVCImplementation = await ethers.getContractFactory('DGVCImplementation');
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

    it('should be possible to updateProxyOwner for owner', async function() {
      const DGVCProxy = await ethers.getContractFactory('DGVCProxy');
      dgvcProxy = new ethers.Contract(dgvcProxy.address, DGVCProxy.interface, owner);

      assert.equal(dgvcImplementation.address, await dgvcProxy.implementation());
      await dgvcProxy.setImplementation(implementationFake.address);
      assert.equal(implementationFake.address, await dgvcProxy.implementation());
    });

    it('should be possible get proxy init values', async function() {
      const DGVCProxy = await ethers.getContractFactory('DGVCProxy');
      dgvcProxy = new ethers.Contract(dgvcProxy.address, DGVCProxy.interface, owner);

      assert.equal(await dgvcProxy.proxyOwner(), owner.address);
      assert.equal(await dgvcProxy.implementation(), dgvcImplementation.address);

      dgvcProxy = new ethers.Contract(dgvcProxy.address, DGVCImplementation.interface, owner);
      assert.equal(await dgvcProxy.owner(), owner.address);
    });

    it('should be possible to set feeReceiver by owner from proxy', async function() {
      assert.equal(await dgvcProxy.feeReceiver(), ZERO_ADDRESS);

      await expect(dgvcProxy.setFeeReceiver(user.address));

      assert.equal(await dgvcProxy.feeReceiver(), user.address);
    });

    it('should be possible to updateProxyOwner for owner', async function() {
      const DGVCProxy = await ethers.getContractFactory('DGVCProxy');
      dgvcProxy = new ethers.Contract(dgvcProxy.address, DGVCProxy.interface, owner);

      assert.equal(owner.address, await dgvcProxy.proxyOwner());
      await dgvcProxy.updateProxyOwner(user.address);
      assert.equal(user.address, await dgvcProxy.proxyOwner());
    });

    it('should NOT be possible to updateProxyOwner for NOT owner', async function() {
      const DGVCProxy = await ethers.getContractFactory('DGVCProxy');
      dgvcProxy = new ethers.Contract(dgvcProxy.address, DGVCProxy.interface, owner);

      await expect(dgvcProxy.connect(user).updateProxyOwner(user.address))
      .to.be.revertedWith('Proxy: caller is not the proxy owner');
    });

    it('should NOT be possible to setImplementation for NOT owner', async function() {
      const DGVCProxy = await ethers.getContractFactory('DGVCProxy');
      dgvcProxy = new ethers.Contract(dgvcProxy.address, DGVCProxy.interface, owner);

      await expect(dgvcProxy.connect(user).setImplementation(user.address))
      .to.be.revertedWith('Proxy: caller is not the proxy owner');
    });

    it('should NOT be possible to init proxy/implementation if already initiated.', async function() {
      assert.isTrue(await dgvcProxy.initiated());
      await expect(dgvcProxy.init(user.address))
      .to.be.revertedWith('Already initiated');
    });

  });
