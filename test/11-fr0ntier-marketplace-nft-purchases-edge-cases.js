const WyvernAtomicizer = artifacts.require('WyvernAtomicizer')
const TokenSwapAgent = artifacts.require('TokenSwapAgent')
const Fr0ntierMarketplace = artifacts.require('Fr0ntierMarketplace')
const Fr0ntierDataWarehouse = artifacts.require('Fr0ntierDataWarehouse')
const StaticMarket = artifacts.require('StaticMarket')
const WyvernRegistry = artifacts.require('WyvernRegistry')
const TestERC20 = artifacts.require('TestERC20')
const TestERC721 = artifacts.require('TestERC721')
const MockFr0ntierToken = artifacts.require('MockFr0ntierToken')

const Web3 = require('web3')
const provider = new Web3.providers.HttpProvider('http://localhost:18888')
const web3 = new Web3(provider)
const { wrap, ZERO_ADDRESS, ZERO_BYTES32, NULL_SIG, CHAIN_ID, assertIsRejected } = require('./aux')
const BN = web3.utils.BN

const primaryMarketPlatformFeeSplitBasisPoints = 3000
const secondaryMarketPlatformFeeSplitBasisPoints = 1000
const epsilon = new BN('5000000000000000000') // 5 * 10**18, 5 Fr0ntier
const alpha = new BN('1000000000000000000')
//const gamma = new BN('100000000000000000').sub(new BN(1))
const gamma = new BN('10000000000000').sub(new BN(1))
const omega = new BN('100000');
const priceThreshold = new BN('1000') // 1000 Wei
const maxRewardPerTrade = new BN('1000000000000000000000') // 1000 * 10**18, 1000 Fr0ntier

contract('Fr0ntier-Marketplace-NFT-Purchases-Edge-Cases', (accounts) => {

    let deployCoreContracts = async () => {
        superAdmin = accounts[9]
        admin = accounts[8]
        platformFeeRecipient = accounts[7]

        fr0ntierToken = await MockFr0ntierToken.new()
        registry = await WyvernRegistry.new()
        atomicizer = await WyvernAtomicizer.new()
        marketplace = await Fr0ntierMarketplace.new(CHAIN_ID, '0x', superAdmin, admin, platformFeeRecipient)
        tokenSwapAgent = await TokenSwapAgent.new(superAdmin, admin)
        dataWarehouse = await Fr0ntierDataWarehouse.new(superAdmin, admin, ZERO_ADDRESS)
        statici = await StaticMarket.new()

        await marketplace.setFr0ntierToken(fr0ntierToken.address, { from: admin })
        await marketplace.setPrimaryMarketPlatformFeeSplitBasisPoints(primaryMarketPlatformFeeSplitBasisPoints, { from: admin })
        await marketplace.setSecondaryMarketPlatformFeeSplitBasisPoints(secondaryMarketPlatformFeeSplitBasisPoints, { from: admin })
        await marketplace.setTokenSwapAgent(tokenSwapAgent.address, { from: admin })
        await marketplace.setDataWarehouse(dataWarehouse.address, { from: admin })
        await marketplace.enableNFTLiqudityMining(true, { from: admin })
        await marketplace.updateLiquidityMiningParams(epsilon, alpha, gamma, omega, priceThreshold, maxRewardPerTrade, { from: admin })
        await marketplace.enableLiqudityMiningOnlyForWhitelistedNFTs(false, { from: admin })

        await tokenSwapAgent.setMarketplace(marketplace.address, { from: admin })
        await dataWarehouse.setMarketplace(marketplace.address, { from: admin })
        await registry.grantInitialAuthentication(marketplace.address)

        return { registry, marketplace: wrap(marketplace), tokenSwapAgent, dataWarehouse, atomicizer, statici, fr0ntierToken }
    }

    let deploy = async contracts => Promise.all(contracts.map(contract => contract.new()))

    it('purchase ERC721 NFT with ERC20 tokens edge cases', async () => {
        let erc20MintAmount = 1000
        let maxERC20Spending = 1000
        let nftTokenID = 7777
        let sellingPrice = 99
        let buyingPrice = 99
        let nftSeller = accounts[6]
        let nftBuyer = accounts[1]
        let admin = accounts[8]
        let whitelister = accounts[5]
        let platformFeeRecipient = accounts[7]

        let { registry, marketplace, tokenSwapAgent, dataWarehouse, atomicizer, statici, fr0ntierToken } = await deployCoreContracts()
        let tokenSwapAgentAddr = tokenSwapAgent.address
        let marketplaceAddr = marketplace.inst.address
        let [erc721] = await deploy([TestERC721])
        let [erc721fake] = await deploy([TestERC721])
        let [erc20] = await deploy([TestERC20])
        await dataWarehouse.setWhitelister(whitelister, { from: admin })
        await dataWarehouse.whitelistPaymentToken(erc20.address, true, { from: whitelister })

        await erc721.mint(nftSeller, nftTokenID)
        await erc721fake.mint(nftSeller, nftTokenID)
        await erc20.mint(nftBuyer, erc20MintAmount)

        // -------------- Account registration and setup -------------- //

        // NFT Seller
        await erc20.approve(tokenSwapAgentAddr, maxERC20Spending, { from: nftSeller })

        // NFT Buyer
        await erc20.approve(tokenSwapAgentAddr, maxERC20Spending, { from: nftBuyer })

        // -------------- The seller puts the NFT on sale -------------- //

        await erc721.setApprovalForAll(tokenSwapAgentAddr, true, { from: nftSeller })
        await erc721fake.setApprovalForAll(tokenSwapAgentAddr, true, { from: nftSeller })
        const erc721c = new web3.eth.Contract(erc721.abi, erc721.address)
        const erc721fakec = new web3.eth.Contract(erc721.abi, erc721fake.address)
        const erc20c = new web3.eth.Contract(erc20.abi, erc20.address)
        anyAccount = accounts[3]

        //
        // Test 1. Seller failed to provide a correct signature
        //

        // NFT Seller
        selectorOne = web3.eth.abi.encodeFunctionSignature('ERC721ForERC20(bytes,address[7],uint8[2],uint256[6],bytes,bytes)')
        paramsOne = web3.eth.abi.encodeParameters(['address[2]', 'uint256[2]'], [[erc721.address, erc20.address], [nftTokenID, sellingPrice]])
        one = { registry: registry.address, maker: nftSeller, staticTarget: statici.address, staticSelector: selectorOne, staticExtradata: paramsOne, maximumFill: 1, listingTime: '0', expirationTime: '10000000000', salt: '11' }
        firstData = erc721c.methods.transferFrom(nftSeller, nftBuyer, nftTokenID).encodeABI()
        firstCall = { target: erc721.address, howToCall: 0, data: firstData }
        sigOne = NULL_SIG // in the actual implementation, this should be signed by the seller

        // NFT Buyer
        selectorTwo = web3.eth.abi.encodeFunctionSignature('ERC20ForERC721(bytes,address[7],uint8[2],uint256[6],bytes,bytes)')
        paramsTwo = web3.eth.abi.encodeParameters(['address[2]', 'uint256[2]'], [[erc20.address, erc721.address], [nftTokenID, buyingPrice]])
        two = { registry: registry.address, maker: nftBuyer, staticTarget: statici.address, staticSelector: selectorTwo, staticExtradata: paramsTwo, maximumFill: 1, listingTime: '0', expirationTime: '10000000000', salt: '12' }
        secondData = erc20c.methods.transferFrom(nftBuyer, nftSeller, buyingPrice).encodeABI()
        secondCall = { target: erc20.address, howToCall: 0, data: secondData }
        sigTwo = await marketplace.sign(two, nftBuyer) // in the actual implementation, this should be signed by the buyer

        assertIsRejected(
            marketplace.tradeNFT(one, sigOne, firstCall, two, sigTwo, secondCall, ZERO_BYTES32, { from: anyAccount }),
            /First order failed authorization/,
            'VM Exception while processing transaction: revert First order failed authorization.'
        )

        //
        // Test 2. Buyer failed to provide a correct signature
        //

        // NFT Seller
        selectorOne = web3.eth.abi.encodeFunctionSignature('ERC721ForERC20(bytes,address[7],uint8[2],uint256[6],bytes,bytes)')
        paramsOne = web3.eth.abi.encodeParameters(['address[2]', 'uint256[2]'], [[erc721.address, erc20.address], [nftTokenID, sellingPrice]])
        one = { registry: registry.address, maker: nftSeller, staticTarget: statici.address, staticSelector: selectorOne, staticExtradata: paramsOne, maximumFill: 1, listingTime: '0', expirationTime: '10000000000', salt: '11' }
        firstData = erc721c.methods.transferFrom(nftSeller, nftBuyer, nftTokenID).encodeABI()
        firstCall = { target: erc721.address, howToCall: 0, data: firstData }
        sigOne = await marketplace.sign(one, nftSeller) // in the actual implementation, this should be signed by the seller

        // NFT Buyer
        selectorTwo = web3.eth.abi.encodeFunctionSignature('ERC20ForERC721(bytes,address[7],uint8[2],uint256[6],bytes,bytes)')
        paramsTwo = web3.eth.abi.encodeParameters(['address[2]', 'uint256[2]'], [[erc20.address, erc721.address], [nftTokenID, buyingPrice]])
        two = { registry: registry.address, maker: nftBuyer, staticTarget: statici.address, staticSelector: selectorTwo, staticExtradata: paramsTwo, maximumFill: 1, listingTime: '0', expirationTime: '10000000000', salt: '12' }
        secondData = erc20c.methods.transferFrom(nftBuyer, nftSeller, buyingPrice).encodeABI()
        secondCall = { target: erc20.address, howToCall: 0, data: secondData }
        sigTwo = NULL_SIG

        assertIsRejected(
            marketplace.tradeNFT(one, sigOne, firstCall, two, sigTwo, secondCall, ZERO_BYTES32, { from: anyAccount }),
            /Second order failed authorization/,
            'VM Exception while processing transaction: revert Second order failed authorization.'
        )

        //
        // Test 3. Seller/Buyer specifes an invalid sanity check functions (ERC721ForERC721). The static call should fail.
        //

        // NFT Seller
        selectorOne = web3.eth.abi.encodeFunctionSignature('ERC721ForERC721(bytes,address[7],uint8[2],uint256[6],bytes,bytes)')
        paramsOne = web3.eth.abi.encodeParameters(['address[2]', 'uint256[2]'], [[erc721.address, erc20.address], [nftTokenID, sellingPrice]])
        one = { registry: registry.address, maker: nftSeller, staticTarget: statici.address, staticSelector: selectorOne, staticExtradata: paramsOne, maximumFill: 1, listingTime: '0', expirationTime: '10000000000', salt: '11' }
        firstData = erc721c.methods.transferFrom(nftSeller, nftBuyer, nftTokenID).encodeABI()
        firstCall = { target: erc721.address, howToCall: 0, data: firstData }
        sigOne = await marketplace.sign(one, nftSeller) // in the actual implementation, this should be signed by the seller

        // NFT Buyer
        selectorTwo = web3.eth.abi.encodeFunctionSignature('ERC20ForERC721(bytes,address[7],uint8[2],uint256[6],bytes,bytes)')
        paramsTwo = web3.eth.abi.encodeParameters(['address[2]', 'uint256[2]'], [[erc20.address, erc721.address], [nftTokenID, buyingPrice]])
        two = { registry: registry.address, maker: nftBuyer, staticTarget: statici.address, staticSelector: selectorTwo, staticExtradata: paramsTwo, maximumFill: 1, listingTime: '0', expirationTime: '10000000000', salt: '12' }
        secondData = erc20c.methods.transferFrom(nftBuyer, nftSeller, buyingPrice).encodeABI()
        secondCall = { target: erc20.address, howToCall: 0, data: secondData }
        sigTwo = await marketplace.sign(two, nftBuyer) // in the actual implementation, this should be signed by the buyer

        assertIsRejected(
            marketplace.tradeNFT(one, sigOne, firstCall, two, sigTwo, secondCall, ZERO_BYTES32, { from: anyAccount }),
            /Static call failed/,
            'VM Exception while processing transaction: revert Static call failed.'
        )

        //
        // Test 4. Seller tries to sell a fake ERC721 (ERC721 address mismatch between seller and buyer)
        //

        // NFT Seller
        selectorOne = web3.eth.abi.encodeFunctionSignature('ERC721ForERC20(bytes,address[7],uint8[2],uint256[6],bytes,bytes)')
        paramsOne = web3.eth.abi.encodeParameters(['address[2]', 'uint256[2]'], [[erc721fake.address, erc20.address], [nftTokenID, sellingPrice]])
        one = { registry: registry.address, maker: nftSeller, staticTarget: statici.address, staticSelector: selectorOne, staticExtradata: paramsOne, maximumFill: 1, listingTime: '0', expirationTime: '10000000000', salt: '11' }
        firstData = erc721fakec.methods.transferFrom(nftSeller, nftBuyer, nftTokenID).encodeABI()
        firstCall = { target: erc721fake.address, howToCall: 0, data: firstData }
        sigOne = await marketplace.sign(one, nftSeller) // in the actual implementation, this should be signed by the seller

        // NFT Buyer
        selectorTwo = web3.eth.abi.encodeFunctionSignature('ERC20ForERC721(bytes,address[7],uint8[2],uint256[6],bytes,bytes)')
        paramsTwo = web3.eth.abi.encodeParameters(['address[2]', 'uint256[2]'], [[erc20.address, erc721.address], [nftTokenID, buyingPrice]])
        two = { registry: registry.address, maker: nftBuyer, staticTarget: statici.address, staticSelector: selectorTwo, staticExtradata: paramsTwo, maximumFill: 1, listingTime: '0', expirationTime: '10000000000', salt: '12' }
        secondData = erc20c.methods.transferFrom(nftBuyer, nftSeller, buyingPrice).encodeABI()
        secondCall = { target: erc20.address, howToCall: 0, data: secondData }
        sigTwo = await marketplace.sign(two, nftBuyer) // in the actual implementation, this should be signed by the buyer

        assertIsRejected(
            marketplace.tradeNFT(one, sigOne, firstCall, two, sigTwo, secondCall, ZERO_BYTES32, { from: anyAccount }),
            /Static call failed/,
            'VM Exception while processing transaction: revert Static call failed.'
        )

        //
        // Test 5. Mismatched selling and buying price (the buyer attemps to pay lower than the selling price)
        //

        // NFT Seller
        selectorOne = web3.eth.abi.encodeFunctionSignature('ERC721ForERC20(bytes,address[7],uint8[2],uint256[6],bytes,bytes)')
        paramsOne = web3.eth.abi.encodeParameters(['address[2]', 'uint256[2]'], [[erc721.address, erc20.address], [nftTokenID, sellingPrice]])
        one = { registry: registry.address, maker: nftSeller, staticTarget: statici.address, staticSelector: selectorOne, staticExtradata: paramsOne, maximumFill: 1, listingTime: '0', expirationTime: '10000000000', salt: '11' }
        firstData = erc721c.methods.transferFrom(nftSeller, nftBuyer, nftTokenID).encodeABI()
        firstCall = { target: erc721.address, howToCall: 0, data: firstData }
        sigOne = await marketplace.sign(one, nftSeller) // in the actual implementation, this should be signed by the seller

        // NFT Buyer
        selectorTwo = web3.eth.abi.encodeFunctionSignature('ERC20ForERC721(bytes,address[7],uint8[2],uint256[6],bytes,bytes)')
        paramsTwo = web3.eth.abi.encodeParameters(['address[2]', 'uint256[2]'], [[erc20.address, erc721.address], [nftTokenID, sellingPrice - 1]])
        two = { registry: registry.address, maker: nftBuyer, staticTarget: statici.address, staticSelector: selectorTwo, staticExtradata: paramsTwo, maximumFill: 1, listingTime: '0', expirationTime: '10000000000', salt: '12' }
        secondData = erc20c.methods.transferFrom(nftBuyer, nftSeller, sellingPrice - 1).encodeABI()
        secondCall = { target: erc20.address, howToCall: 0, data: secondData }
        sigTwo = await marketplace.sign(two, nftBuyer) // in the actual implementation, this should be signed by the buyer

        assertIsRejected(
            marketplace.tradeNFT(one, sigOne, firstCall, two, sigTwo, secondCall, ZERO_BYTES32, { from: anyAccount }),
            /selling and buying mismatch/,
            'VM Exception while processing transaction: revert selling and buying mismatch.'
        )

        //
        // The last test. Should succeed
        //

        // NFT Seller
        selectorOne = web3.eth.abi.encodeFunctionSignature('ERC721ForERC20(bytes,address[7],uint8[2],uint256[6],bytes,bytes)')
        paramsOne = web3.eth.abi.encodeParameters(['address[2]', 'uint256[2]'], [[erc721.address, erc20.address], [nftTokenID, sellingPrice]])
        one = { registry: registry.address, maker: nftSeller, staticTarget: statici.address, staticSelector: selectorOne, staticExtradata: paramsOne, maximumFill: 1, listingTime: '0', expirationTime: '10000000000', salt: '11' }
        firstData = erc721c.methods.transferFrom(nftSeller, nftBuyer, nftTokenID).encodeABI()
        firstCall = { target: erc721.address, howToCall: 0, data: firstData }
        sigOne = await marketplace.sign(one, nftSeller) // in the actual implementation, this should be signed by the seller

        // NFT Buyer
        selectorTwo = web3.eth.abi.encodeFunctionSignature('ERC20ForERC721(bytes,address[7],uint8[2],uint256[6],bytes,bytes)')
        paramsTwo = web3.eth.abi.encodeParameters(['address[2]', 'uint256[2]'], [[erc20.address, erc721.address], [nftTokenID, buyingPrice]])
        two = { registry: registry.address, maker: nftBuyer, staticTarget: statici.address, staticSelector: selectorTwo, staticExtradata: paramsTwo, maximumFill: 1, listingTime: '0', expirationTime: '10000000000', salt: '12' }
        secondData = erc20c.methods.transferFrom(nftBuyer, nftSeller, buyingPrice).encodeABI()
        secondCall = { target: erc20.address, howToCall: 0, data: secondData }
        sigTwo = await marketplace.sign(two, nftBuyer) // in the actual implementation, this should be signed by the buyer

        // Trade NFT
        await marketplace.tradeNFT(one, sigOne, firstCall, two, sigTwo, secondCall, ZERO_BYTES32, { from: anyAccount }) // anyone can trigger the trade

        // Verify the NFT Trade
        let nftBuyerERC20Balance = await erc20.balanceOf(nftBuyer)
        let nftSellerERC20Balance = await erc20.balanceOf(nftSeller)
        let platformFeeRecipientERC20Balance = await erc20.balanceOf(platformFeeRecipient)
        let tokenOwner = await erc721.ownerOf(nftTokenID)

        split = primaryMarketPlatformFeeSplitBasisPoints / 10000.0
        expectedPlatformFee = Math.floor(buyingPrice * split)
        expectedNFTSellerERC20Balance = buyingPrice - expectedPlatformFee
        assert.equal(platformFeeRecipientERC20Balance.toNumber(), expectedPlatformFee, 'Incorrect ERC20 balance')
        assert.equal(nftSellerERC20Balance.toNumber(), expectedNFTSellerERC20Balance, 'Incorrect ERC20 balance')
        assert.equal(tokenOwner, nftBuyer, 'Incorrect token owner')
    })

    it('purchase ERC721 NFT with ETH edge cases', async () => {
        // NOTE: the (msgValue == price) check in StaticMarket.ETHForERC721() and StaticMarket.ERC721ForETH()
        //       require that (msg.value == sellingPrice && msg.value == buyingPrice) for NFT/ETH trade.
        //       i.e. for NFT/ETH trandes, sellingPrice and buyingPrice need to be identical, otherwise the 
        //       atomicMatch() will fail
        let nftTokenID = 9912879027088
        let sellingPrice = 2834508383853485
        let buyingPrice = 2834508383853485
        let nftSeller = accounts[6]
        let nftBuyer = accounts[0]
        let platformFeeRecipient = accounts[7]

        let { registry, marketplace, tokenSwapAgent, dataWarehouse, atomicizer, statici, fr0ntierToken } = await deployCoreContracts()
        let tokenSwapAgentAddr = tokenSwapAgent.address
        let [erc721] = await deploy([TestERC721])
        let [erc721fake] = await deploy([TestERC721])

        await erc721.mint(nftSeller, nftTokenID)

        // -------------- Account registration and setup -------------- //

        // -------------- The seller puts the NFT on sale -------------- //

        await erc721.setApprovalForAll(tokenSwapAgentAddr, true, { from: nftSeller })

        let buyerInitialEthBalance = await web3.eth.getBalance(nftBuyer)
        let sellerInitialEthBalance = await web3.eth.getBalance(nftSeller)
        let platformFeeRecipientInitialEthBalance = await web3.eth.getBalance(platformFeeRecipient)
        const erc721c = new web3.eth.Contract(erc721.abi, erc721.address)
        const erc721fakec = new web3.eth.Contract(erc721.abi, erc721fake.address)

        //
        // Test 1. Seller failed to provide a correct signature
        //

        // NFT Seller
        selectorOne = web3.eth.abi.encodeFunctionSignature('ERC721ForETH(bytes,address[7],uint8[2],uint256[6],bytes,bytes)')
        paramsOne = web3.eth.abi.encodeParameters(['address[2]', 'uint256[2]'], [[erc721.address, "0x0000000000000000000000000000000000000000"], [nftTokenID, sellingPrice]])
        one = { registry: registry.address, maker: nftSeller, staticTarget: statici.address, staticSelector: selectorOne, staticExtradata: paramsOne, maximumFill: 1, listingTime: '0', expirationTime: '10000000000', salt: '11' }
        firstData = erc721c.methods.transferFrom(nftSeller, nftBuyer, nftTokenID).encodeABI()
        firstCall = { target: erc721.address, howToCall: 0, data: firstData }
        sigOne = NULL_SIG

        // NFT Buyer, target: "0x0000000000000000000000000000000000000000" indicates buying with ETH
        selectorTwo = web3.eth.abi.encodeFunctionSignature('ETHForERC721(bytes,address[7],uint8[2],uint256[6],bytes,bytes)')
        paramsTwo = web3.eth.abi.encodeParameters(['address[2]', 'uint256[2]'], [["0x0000000000000000000000000000000000000000", erc721.address], [nftTokenID, buyingPrice]])
        two = { registry: registry.address, maker: nftBuyer, staticTarget: statici.address, staticSelector: selectorTwo, staticExtradata: paramsTwo, maximumFill: 1, listingTime: '0', expirationTime: '10000000000', salt: '12' }
        secondCall = { target: "0x0000000000000000000000000000000000000000", howToCall: 0, data: "0x" }
        sigTwo = await marketplace.sign(two, nftBuyer) // in an actual implementation, this should be signed by the buyer

        // Trade NFT. tradeNFT needs to be called by the nftBuyer since the buyer needs to pay the ETH
        assertIsRejected(
            marketplace.tradeNFT(one, sigOne, firstCall, two, sigTwo, secondCall, ZERO_BYTES32, { from: nftBuyer, value: sellingPrice }),
            /First order failed authorization/,
            'VM Exception while processing transaction: revert First order failed authorization.'
        )

        //
        // Test 2. Buyer failed to provide a correct signature
        //

        // NFT Seller
        selectorOne = web3.eth.abi.encodeFunctionSignature('ERC721ForETH(bytes,address[7],uint8[2],uint256[6],bytes,bytes)')
        paramsOne = web3.eth.abi.encodeParameters(['address[2]', 'uint256[2]'], [[erc721.address, "0x0000000000000000000000000000000000000000"], [nftTokenID, sellingPrice]])
        one = { registry: registry.address, maker: nftSeller, staticTarget: statici.address, staticSelector: selectorOne, staticExtradata: paramsOne, maximumFill: 1, listingTime: '0', expirationTime: '10000000000', salt: '11' }
        firstData = erc721c.methods.transferFrom(nftSeller, nftBuyer, nftTokenID).encodeABI()
        firstCall = { target: erc721.address, howToCall: 0, data: firstData }
        sigOne = await marketplace.sign(one, nftSeller) // in an actual implementation, this should be signed by the seller

        // NFT Buyer, target: "0x0000000000000000000000000000000000000000" indicates buying with ETH
        selectorTwo = web3.eth.abi.encodeFunctionSignature('ETHForERC721(bytes,address[7],uint8[2],uint256[6],bytes,bytes)')
        paramsTwo = web3.eth.abi.encodeParameters(['address[2]', 'uint256[2]'], [["0x0000000000000000000000000000000000000000", erc721.address], [nftTokenID, buyingPrice]])
        two = { registry: registry.address, maker: nftBuyer, staticTarget: statici.address, staticSelector: selectorTwo, staticExtradata: paramsTwo, maximumFill: 1, listingTime: '0', expirationTime: '10000000000', salt: '12' }
        secondCall = { target: "0x0000000000000000000000000000000000000000", howToCall: 0, data: "0x" }
        sigTwo = NULL_SIG

        anyAccount = accounts[3] // send from anyAccount just to force the marketplace to verify the signature of the buyer                
        assertIsRejected(
            marketplace.tradeNFT(one, sigOne, firstCall, two, sigTwo, secondCall, ZERO_BYTES32, { from: anyAccount, value: sellingPrice }),
            /Second order failed authorization/,
            'VM Exception while processing transaction: revert Second order failed authorization.'
        )

        //
        // Test 3. Buyer specifes an incorrect sanity check functions (ERC20ForERC721) for purchasing with ETH. The static call should fail.
        //

        // NFT Seller
        selectorOne = web3.eth.abi.encodeFunctionSignature('ERC721ForETH(bytes,address[7],uint8[2],uint256[6],bytes,bytes)')
        paramsOne = web3.eth.abi.encodeParameters(['address[2]', 'uint256[2]'], [[erc721.address, "0x0000000000000000000000000000000000000000"], [nftTokenID, sellingPrice]])
        one = { registry: registry.address, maker: nftSeller, staticTarget: statici.address, staticSelector: selectorOne, staticExtradata: paramsOne, maximumFill: 1, listingTime: '0', expirationTime: '10000000000', salt: '11' }
        firstData = erc721c.methods.transferFrom(nftSeller, nftBuyer, nftTokenID).encodeABI()
        firstCall = { target: erc721.address, howToCall: 0, data: firstData }
        sigOne = await marketplace.sign(one, nftSeller) // in an actual implementation, this should be signed by the seller

        // NFT Buyer, target: "0x0000000000000000000000000000000000000000" indicates buying with ETH
        selectorTwo = web3.eth.abi.encodeFunctionSignature('ERC20ForERC721(bytes,address[7],uint8[2],uint256[6],bytes,bytes)')
        paramsTwo = web3.eth.abi.encodeParameters(['address[2]', 'uint256[2]'], [["0x0000000000000000000000000000000000000000", erc721.address], [nftTokenID, buyingPrice]])
        two = { registry: registry.address, maker: nftBuyer, staticTarget: statici.address, staticSelector: selectorTwo, staticExtradata: paramsTwo, maximumFill: 1, listingTime: '0', expirationTime: '10000000000', salt: '12' }
        secondCall = { target: "0x0000000000000000000000000000000000000000", howToCall: 0, data: "0x" }
        sigTwo = await marketplace.sign(two, nftBuyer) // in an actual implementation, this should be signed by the buyer

        // Trade NFT. tradeNFT needs to be called by the nftBuyer since the buyer needs to pay the ETH
        assertIsRejected(
            marketplace.tradeNFT(one, sigOne, firstCall, two, sigTwo, secondCall, ZERO_BYTES32, { from: nftBuyer, value: sellingPrice }),
            /Static call failed/,
            'VM Exception while processing transaction: revert Static call failed.'
        )

        //
        // Test 4. Seller tries to sell a fake ERC721 (ERC721 address mismatch between seller and buyer)
        //

        // NFT Seller
        selectorOne = web3.eth.abi.encodeFunctionSignature('ERC721ForETH(bytes,address[7],uint8[2],uint256[6],bytes,bytes)')
        paramsOne = web3.eth.abi.encodeParameters(['address[2]', 'uint256[2]'], [[erc721fake.address, "0x0000000000000000000000000000000000000000"], [nftTokenID, sellingPrice]])
        one = { registry: registry.address, maker: nftSeller, staticTarget: statici.address, staticSelector: selectorOne, staticExtradata: paramsOne, maximumFill: 1, listingTime: '0', expirationTime: '10000000000', salt: '11' }
        firstData = erc721fakec.methods.transferFrom(nftSeller, nftBuyer, nftTokenID).encodeABI()
        firstCall = { target: erc721fake.address, howToCall: 0, data: firstData }
        sigOne = await marketplace.sign(one, nftSeller) // in an actual implementation, this should be signed by the seller

        // NFT Buyer, target: "0x0000000000000000000000000000000000000000" indicates buying with ETH
        selectorTwo = web3.eth.abi.encodeFunctionSignature('ETHForERC721(bytes,address[7],uint8[2],uint256[6],bytes,bytes)')
        paramsTwo = web3.eth.abi.encodeParameters(['address[2]', 'uint256[2]'], [["0x0000000000000000000000000000000000000000", erc721.address], [nftTokenID, buyingPrice]])
        two = { registry: registry.address, maker: nftBuyer, staticTarget: statici.address, staticSelector: selectorTwo, staticExtradata: paramsTwo, maximumFill: 1, listingTime: '0', expirationTime: '10000000000', salt: '12' }
        secondCall = { target: "0x0000000000000000000000000000000000000000", howToCall: 0, data: "0x" }
        sigTwo = await marketplace.sign(two, nftBuyer) // in an actual implementation, this should be signed by the buyer

        // Trade NFT. tradeNFT needs to be called by the nftBuyer since the buyer needs to pay the ETH
        assertIsRejected(
            marketplace.tradeNFT(one, sigOne, firstCall, two, sigTwo, secondCall, ZERO_BYTES32, { from: nftBuyer, value: sellingPrice }),
            /First call failed/,
            'VM Exception while processing transaction: revert First call failed.'
        )

        //
        // Test 5. Mismatched selling and buying price (the buyer attemps to pay lower than the selling price)
        //

        // NFT Seller
        selectorOne = web3.eth.abi.encodeFunctionSignature('ERC721ForETH(bytes,address[7],uint8[2],uint256[6],bytes,bytes)')
        paramsOne = web3.eth.abi.encodeParameters(['address[2]', 'uint256[2]'], [[erc721.address, "0x0000000000000000000000000000000000000000"], [nftTokenID, sellingPrice]])
        one = { registry: registry.address, maker: nftSeller, staticTarget: statici.address, staticSelector: selectorOne, staticExtradata: paramsOne, maximumFill: 1, listingTime: '0', expirationTime: '10000000000', salt: '11' }
        firstData = erc721c.methods.transferFrom(nftSeller, nftBuyer, nftTokenID).encodeABI()
        firstCall = { target: erc721.address, howToCall: 0, data: firstData }
        sigOne = await marketplace.sign(one, nftSeller) // in an actual implementation, this should be signed by the seller

        // NFT Buyer, target: "0x0000000000000000000000000000000000000000" indicates buying with ETH
        selectorTwo = web3.eth.abi.encodeFunctionSignature('ETHForERC721(bytes,address[7],uint8[2],uint256[6],bytes,bytes)')
        paramsTwo = web3.eth.abi.encodeParameters(['address[2]', 'uint256[2]'], [["0x0000000000000000000000000000000000000000", erc721.address], [nftTokenID, buyingPrice]])
        two = { registry: registry.address, maker: nftBuyer, staticTarget: statici.address, staticSelector: selectorTwo, staticExtradata: paramsTwo, maximumFill: 1, listingTime: '0', expirationTime: '10000000000', salt: '12' }
        secondCall = { target: "0x0000000000000000000000000000000000000000", howToCall: 0, data: "0x" }
        sigTwo = await marketplace.sign(two, nftBuyer) // in an actual implementation, this should be signed by the buyer

        // Trade NFT. tradeNFT needs to be called by the nftBuyer since the buyer needs to pay the ETH
        assertIsRejected(
            marketplace.tradeNFT(one, sigOne, firstCall, two, sigTwo, secondCall, ZERO_BYTES32, { from: nftBuyer, value: sellingPrice - 1 }),
            /invalid amount of ETH for the purchase/,
            'VM Exception while processing transaction: revert invalid amount of ETH for the purchase.'
        )

        //
        // The last test. Should succeed
        //

        // NFT Seller
        selectorOne = web3.eth.abi.encodeFunctionSignature('ERC721ForETH(bytes,address[7],uint8[2],uint256[6],bytes,bytes)')
        paramsOne = web3.eth.abi.encodeParameters(['address[2]', 'uint256[2]'], [[erc721.address, "0x0000000000000000000000000000000000000000"], [nftTokenID, sellingPrice]])
        one = { registry: registry.address, maker: nftSeller, staticTarget: statici.address, staticSelector: selectorOne, staticExtradata: paramsOne, maximumFill: 1, listingTime: '0', expirationTime: '10000000000', salt: '11' }
        firstData = erc721c.methods.transferFrom(nftSeller, nftBuyer, nftTokenID).encodeABI()
        firstCall = { target: erc721.address, howToCall: 0, data: firstData }
        sigOne = await marketplace.sign(one, nftSeller) // in an actual implementation, this should be signed by the seller

        // NFT Buyer, target: "0x0000000000000000000000000000000000000000" indicates buying with ETH
        selectorTwo = web3.eth.abi.encodeFunctionSignature('ETHForERC721(bytes,address[7],uint8[2],uint256[6],bytes,bytes)')
        paramsTwo = web3.eth.abi.encodeParameters(['address[2]', 'uint256[2]'], [["0x0000000000000000000000000000000000000000", erc721.address], [nftTokenID, buyingPrice]])
        two = { registry: registry.address, maker: nftBuyer, staticTarget: statici.address, staticSelector: selectorTwo, staticExtradata: paramsTwo, maximumFill: 1, listingTime: '0', expirationTime: '10000000000', salt: '12' }
        secondCall = { target: "0x0000000000000000000000000000000000000000", howToCall: 0, data: "0x" }
        sigTwo = await marketplace.sign(two, nftBuyer) // in an actual implementation, this should be signed by the buyer

        // Trade NFT. tradeNFT needs to be called by the nftBuyer since the buyer needs to pay the ETH
        await marketplace.tradeNFT(one, sigOne, firstCall, two, sigTwo, secondCall, ZERO_BYTES32, { from: nftBuyer, value: sellingPrice })

        // Verify the NFT Trade
        let tokenOwner = await erc721.ownerOf(nftTokenID)
        assert.equal(tokenOwner, nftBuyer, 'Incorrect token owner')

        let buyerFinalEthBalance = await web3.eth.getBalance(nftBuyer)
        let sellerFinalEthBalance = await web3.eth.getBalance(nftSeller)
        let platformFeeRecipientFinalEthBalance = await web3.eth.getBalance(platformFeeRecipient)
        let buyerFr0ntierBalance = await fr0ntierToken.balanceOf(nftBuyer)
        let sellerFr0ntierBalance = await fr0ntierToken.balanceOf(nftSeller)

        split = primaryMarketPlatformFeeSplitBasisPoints / 10000.0
        expectedPlatformFee = Math.floor(buyingPrice * split)
        expectedNFTSellerEarning = buyingPrice - expectedPlatformFee

        let sellerFinalEthBalanceBN = web3.utils.toBN(sellerFinalEthBalance)
        let sellerInitialEthBalanceBN = web3.utils.toBN(sellerInitialEthBalance)

        let platformFeeRecipientFinalEthBalanceBN = web3.utils.toBN(platformFeeRecipientFinalEthBalance)
        let platformFeeRecipientInitialEthBalanceBN = web3.utils.toBN(platformFeeRecipientInitialEthBalance)

        assert.equal(sellerFinalEthBalanceBN.sub(sellerInitialEthBalanceBN), expectedNFTSellerEarning, 'Incorrect amount of ETH transferred')
        assert.equal(platformFeeRecipientFinalEthBalanceBN.sub(platformFeeRecipientInitialEthBalanceBN), expectedPlatformFee, 'Incorrect platform fee transferred')
        assert.isTrue(sellerFr0ntierBalance.cmp(new BN('0')) == 0) // sellerFr0ntierBalance == 0
        assert.isTrue(buyerFr0ntierBalance.cmp(epsilon) == 1) // buyerFr0ntierBalance > epsilon
    })
})
