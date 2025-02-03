const port = process.argv[2];
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const Blockchain = require('./util/blockchain.js');
const {v1 :uuidv1} = require('uuid');
const rp = require('request-promise');
const { getCurrentPrice } = require('./util/upbit.js');



app.set('views', __dirname + '/views')
app.set('view engine','ejs');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

const bitcoin = new Blockchain();
const nodeAddress = uuidv1().split('-').join('');

const root = require('./lib/root.js');

setInterval(async () => {
    try{
        const prices = await getCurrentPrice();
        const timestamp = new Date();

        const bitcoinTransaction = {
            coin: 'BTC',
            price: prices.bitcoin.trade_price.toLocaleString(),
            timestamp: timestamp
        }
        const ethereumTransaction = {
            coin: 'ETH',
            price: prices.etc.trade_price.toLocaleString(),
            timestamp: timestamp
        }
        const dogecoinTransaction = {
            coin: 'DOGE',
            price: prices.doge.trade_price,
            timestamp: timestamp
        }

        const transactions = [bitcoinTransaction, ethereumTransaction, dogecoinTransaction]

        for (const transaction of transactions){
            await rp({
                uri: `http://localhost:${port}/transaction/broadcast`,
                method: 'POST',
                body: transaction,
                json: true
            });
            console.log(`${transaction.coin} 트랜잭션 새성 및 브로드캐스트 완료 `)
        }
    }catch(err){
        console.error('Error fetching prices or broadcasting transactions: ', err.message)
    }
},10000)



app.get('/pending/transactions', (req,res)=>{
    res.json(bitcoin.pendingTransactions)
})

// 블록체인 전체 출력
app.get('/blockchain', function (req, res) {
    req.instance = bitcoin
    root.blockchain(req,res)
    // res.send(bitcoin)
});

// 트랜잭션 저장
app.post('/transaction', function (req, res) {
    const newTransaction = req.body;
    const blockIndex = bitcoin.addTransactionToPendingTransactions(newTransaction);
    res.json({note: `Transaction will be added in block ${blockIndex}.`});
});

app.post('/transaction/broadcast', function (req, res) {

    const newTransaction = bitcoin.createNewTransaction(req.body.coin, req.body.price, req.body.timestamp);
    bitcoin.addTransactionToPendingTransactions(newTransaction);

    const requestPromises = [];
    bitcoin.networkNodes.forEach(networkNodeUrl =>{
        const requestOptions = {
            uri: networkNodeUrl + '/transaction',
            method: 'POST',
            body:newTransaction,
            json: true
        };
        requestPromises.push(rp(requestOptions));
    })

    Promise.all(requestPromises)
        .then(data =>{
            res.json({ note: "Transaction created and broadcast successfully."});
        });
});

// 블록 생성
app.get('/mine', function (req, res) {
    const lastBlock = bitcoin.getLastBlock();
    const previousBlockHash = lastBlock['hash']; // 이전 블록의 해시값 가져옴
    const currentBlockData = {
        transactions: bitcoin.pendingTransactions,
        index: lastBlock['index'] + 1
    }
    const nonce = bitcoin.proofOfWork(previousBlockHash, currentBlockData);

    const blockHash = bitcoin.hashBlock(previousBlockHash, currentBlockData,nonce);

    // bitcoin.createNewTransaction(6.25,"00",nodeAddress);

    const newBlock = bitcoin.createNewBlock(nonce,previousBlockHash,blockHash);

    const requestPromises = [];
    bitcoin.networkNodes.forEach(networkNodeUrl =>{
        const requestOptions = {
            uri: networkNodeUrl + '/receive-new-block',
            method: 'POST',
            body:{ newBlock: newBlock},
            json: true
        };
        requestPromises.push(rp(requestOptions));
    })

    Promise.all(requestPromises)
        .then(data =>{
            // const requestOptions = {
            //     uri: bitcoin.currentNodeUrl + '/transaction/broadcast',
            //     method: 'POST',
            //     body:{
            //         amount: 6.25,
            //         sender:"00",
            //         recipient: nodeAddress
            //     },
            //     json: true
            // };
            // return rp(requestOptions);
            res.json({
                note: "New Block mined successfully",
                block: newBlock
            })
        })


});

app.post('/receive-new-block',function (req, res) {
    const newBlock = req.body.newBlock;
    const lastBlock = bitcoin.getLastBlock();
    const correctHash = lastBlock.hash === newBlock.previousBlockHash;
    const correctIndex = lastBlock['index'] + 1 === newBlock['index'];

    if(correctHash && correctIndex){
        bitcoin.chain.push(newBlock);
        bitcoin.pendingTransactions = [];
        res.json({
            note: "New Block received and accepted",
            newBlock: newBlock
        });
    }else{
        res.json({
            note:'New block rejected.',
            newBlock: newBlock
        })
    }
});

app.post('/register-and-broadcast-node', function (req,res){
    const newNodeUrl = req.body.newNodeUrl;
    if(bitcoin.networkNodes.indexOf(newNodeUrl) === -1)
        bitcoin.networkNodes.push(newNodeUrl);

    const regNodesPromises = [];
    bitcoin.networkNodes.forEach(networkNodeUrl =>{
        const requestOptions = {
            uri: networkNodeUrl + '/register-node',
            method: 'POST',
            body:{ newNodeUrl: newNodeUrl},
            json: true
        }
        regNodesPromises.push(rp(requestOptions));
    });

    Promise.all(regNodesPromises)
        .then(data=>{
            const bulkRegisterOptions = {
                uri: newNodeUrl + '/register-nodes-bulk',
                method: 'POST',
                body: { allNetworkNodes: [...bitcoin.networkNodes, bitcoin.currentNodeUrl] },
                json: true
            };
            return rp(bulkRegisterOptions);
        })
        .then (data =>{
            res.json({ note: 'New Node registered with network successfully'});
        });
});

app.post('/register-node',function (req,res){
    const newNodeUrl = req.body.newNodeUrl;
    const nodeNotAlreadyPresent = bitcoin.networkNodes.indexOf(newNodeUrl) === -1;
    const notCurrentNode = bitcoin.currentNodeUrl !== newNodeUrl;

    if(nodeNotAlreadyPresent && notCurrentNode) {
        bitcoin.networkNodes.push(newNodeUrl);
    }

    res.json({note: "New Node registered successfully"});
})

app.post('/register-nodes-bulk', function (req, res) {
    const allNetworkNodes = req.body.allNetworkNodes;

    allNetworkNodes.forEach(networkNodeUrl =>{
        const nodeNotAlreadyPresent = bitcoin.networkNodes.indexOf(networkNodeUrl) === -1;
        const notCurrentNode = bitcoin.currentNodeUrl !== networkNodeUrl;

        if(nodeNotAlreadyPresent && notCurrentNode)
            bitcoin.networkNodes.push(networkNodeUrl);
    })
    res.json({note: 'Bulk registration successful.'});
})

// chainIsValid 메서드을 사용하여 체인의 무결성 검증
app.get('/consensus', function (req,res){
    const requestPromises = [];
    bitcoin.networkNodes.forEach(networkNodeUrl =>{
        const requestOptions = {
            uri: networkNodeUrl + "/blockchain",
            method: 'GET',
            json:true
        }
        requestPromises.push(rp(requestOptions));
    })

    Promise.all(requestPromises)
        .then(blockchains=>{
            let currentBlockchain = bitcoin;
            const currentChainLength = currentBlockchain.chain.length;
            let maxChainLength = currentChainLength;
            let newLongestChain = null;
            let newPendingTransactions = null;

            // 현재 체인 검사
            const currentChainValid = bitcoin.chainIsValid(bitcoin.chain);

            if(!currentChainValid){
                for (const blockchain of blockchains){
                    if(bitcoin.chainIsValid(blockchain.chain)){
                        maxChainLength = blockchain.chain.length;
                        newLongestChain = blockchain.chain;
                        newPendingTransactions = blockchain.pendingTransactions;
                        break;
                    }
                }
            }

            blockchains.forEach(blockchain =>{
                // 블록체인 내의 더 긴 체인이 발견되면
                if(blockchain.chain.length > maxChainLength){
                    maxChainLength = blockchain.chain.length; //최대 체인의 값을 변경
                    newLongestChain = blockchain.chain;  // 제일 긴 체인으로 체인 설정
                    newPendingTransactions = blockchain.pendingTransactions; // 미결 트랜잭션 가져오기
                }
            })

            if(currentChainValid && ( !newLongestChain || (newLongestChain && !bitcoin.chainIsValid(newLongestChain)))){
                res.json({
                    note:'Current chain has not been replaced',
                    chain: bitcoin.chain
                });
            }else{
                bitcoin.chain = newLongestChain;
                bitcoin.pendingTransactions = newPendingTransactions;
                res.json({
                    note:'This chain has been replaced',
                    chain:bitcoin.chain
                });
            }
        })
});

// 블록 데이터 조작과 잘못된 블록 추가
app.get('/hacking', function (req,res){
    console.log('해킹 시도: 잘못된 블록을 추가')
    bitcoin.chain.push({
        index: 3,
        timestamp: Date.now(),
        transactions: [],
        nonce: 11111,
        hash: 'hacking123',
        previousBlcokHash: 'hackingff'
    })

    const blockAddHackingResult = bitcoin.chainIsValid(bitcoin.chain);
    console.log('노드 내의 블록들 간의 무결성 유지 여부 검사: ', bitcoin.chainIsValid(bitcoin.chain));

    console.log('해킹 시도: 첫번째 블록의 트랜잭션 변경')
    console.log(bitcoin.chain[1].transactions[0]);
    bitcoin.chain[1].transactions[0].coin = "haking";

    const transactionsHackingResult = bitcoin.chainIsValid(bitcoin.chain);
    console.log('노드 내의 블록들간의 무결성 유지 여부 검사: ', transactionsHackingResult)



    res.send(`
        <h1> 잘못된 블록을 추가</h1>
        <h2> 노드 내의 무결성 검사: ${blockAddHackingResult}</h2>
        
        <h1> 트랜잭션의 거래량을 변경...</h1>
        <h2> 노드내의 무결성 검사: ${transactionsHackingResult}</h2>
        
        <p>검사 결과가 false: 블록체인이 문제가 있는경우</p>
        <p>검사 결과가 true: 블록체인이 문제가 없는경우</p>
    `)
})

app.listen(port, function() {
    console.log(`listening on port ${port}...`)
});

