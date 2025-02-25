// const port = process.argv[2];
// const express = require('express');
// const app = express();
// const bodyParser = require('body-parser');
// const Blockchain = require('./blockchain.js');
// const {v1 :uuidv1} = require('uuid');
// const rp = require('request-promise');
//
//
// app.use(bodyParser.json());
// app.use(bodyParser.urlencoded({ extended: false }));
//
// const bitcoin = new Blockchain();
// const nodeAddress = uuidv1().split('-').join('');
//
//
//
//
// // 블록체인 전체 출력
// app.get('/blockchain', function (req, res) {
//     res.send(bitcoin)
// });
//
// // 트랜잭션 저장
// app.post('/transaction', function (req, res) {
//     const newTransaction = req.body;
//     const blockIndex = bitcoin.addTransactionToPendingTransactions(newTransaction);
//     res.json({note: `Transaction will be added in block ${blockIndex}.`});
// });
//
// app.post('/transaction/broadcast', function (req, res) {
//    const newTransaction = bitcoin.createNewTransaction(req.body.amount, req.body.sender, req.body.recipient);
//    bitcoin.addTransactionToPendingTransactions(newTransaction);
//
//    const requestPromises = [];
//    bitcoin.networkNodes.forEach(networkNodeUrl =>{
//        const requestOptions = {
//             uri: networkNodeUrl + '/transaction',
//            method: 'POST',
//            body:newTransaction,
//            json: true
//        };
//        requestPromises.push(rp(requestOptions));
//    })
//
//     Promise.all(requestPromises)
//         .then(data =>{
//             res.json({ note: "Transaction created and broadcast successfully."});
//         });
// });
//
// // 블록 생성
// app.get('/mine', function (req, res) {
//     const lastBlock = bitcoin.getLastBlock();
//     const previousBlockHash = lastBlock['hash']; // 이전 블록의 해시값 가져옴
//     const currentBlockData = {
//         transactions: bitcoin.pendingTransactions,
//         index: lastBlock['index'] + 1
//     }
//     const nonce = bitcoin.proofOfWork(previousBlockHash, currentBlockData);
//
//     const blockHash = bitcoin.hashBlock(previousBlockHash, currentBlockData,nonce);
//
//     // bitcoin.createNewTransaction(6.25,"00",nodeAddress);
//
//     const newBlock = bitcoin.createNewBlock(nonce,previousBlockHash,blockHash);
//
//     const requestPromises = [];
//     bitcoin.networkNodes.forEach(networkNodeUrl =>{
//         const requestOptions = {
//             uri: networkNodeUrl + '/receive-new-block',
//             method: 'POST',
//             body:{ newBlock: newBlock},
//             json: true
//         };
//         requestPromises.push(rp(requestOptions));
//     })
//
//     Promise.all(requestPromises)
//         .then(data =>{
//             const requestOptions = {
//                 uri: bitcoin.currentNodeUrl + '/transaction/broadcast',
//                 method: 'POST',
//                 body:{
//                     amount: 6.25,
//                     sender:"00",
//                     recipient: nodeAddress
//                 },
//                 json: true
//             };
//             return rp(requestOptions);
//         })
//
//     res.json({
//         note: "New Block mined successfully",
//         block: newBlock
//     })
// });
//
// app.post('/receive-new-block',function (req, res) {
//     const newBlock = req.body.newBlock;
//     const lastBlock = bitcoin.getLastBlock();
//     const correctHash = lastBlock.hash === newBlock.previousBlockHash;
//     const correctIndex = lastBlock['index'] + 1 === newBlock['index'];
//
//     if(correctHash && correctIndex){
//         bitcoin.chain.push(newBlock);
//         bitcoin.pendingTransactions = [];
//         res.json({
//             note: "New Block received and accepted",
//             newBlock: newBlock
//         });
//     }else{
//         res.json({
//             note:'New block rejected.',
//             newBlock: newBlock
//         })
//     }
// });
//
// app.post('/register-and-broadcast-node', function (req,res){
//     const newNodeUrl = req.body.newNodeUrl;
//     if(bitcoin.networkNodes.indexOf(newNodeUrl) === -1)
//         bitcoin.networkNodes.push(newNodeUrl);
//
//     const regNodesPromises = [];
//     bitcoin.networkNodes.forEach(networkNodeUrl =>{
//         const requestOptions = {
//             uri: networkNodeUrl + '/register-node',
//             method: 'POST',
//             body:{ newNodeUrl: newNodeUrl},
//             json: true
//         }
//         regNodesPromises.push(rp(requestOptions));
//     });
//
//     Promise.all(regNodesPromises)
//         .then(data=>{
//             const bulkRegisterOptions = {
//                 uri: newNodeUrl + '/register-nodes-bulk',
//                 method: 'POST',
//                 body: { allNetworkNodes: [...bitcoin.networkNodes, bitcoin.currentNodeUrl] },
//                 json: true
//             };
//             return rp(bulkRegisterOptions);
//         })
//         .then (data =>{
//             res.json({ note: 'New Node registered with network successfully'});
//         });
// });
//
// app.post('/register-node',function (req,res){
//     const newNodeUrl = req.body.newNodeUrl;
//     const nodeNotAlreadyPresent = bitcoin.networkNodes.indexOf(newNodeUrl) === -1;
//     const notCurrentNode = bitcoin.currentNodeUrl !== newNodeUrl;
//
//     if(nodeNotAlreadyPresent && notCurrentNode) {
//         bitcoin.networkNodes.push(newNodeUrl);
//     }
//
//     res.json({note: "New Node registered successfully"});
// })
//
// app.post('/register-nodes-bulk', function (req, res) {
//     const allNetworkNodes = req.body.allNetworkNodes;
//
//     allNetworkNodes.forEach(networkNodeUrl =>{
//         const nodeNotAlreadyPresent = bitcoin.networkNodes.indexOf(networkNodeUrl) === -1;
//         const notCurrentNode = bitcoin.currentNodeUrl !== networkNodeUrl;
//
//         if(nodeNotAlreadyPresent && notCurrentNode)
//             bitcoin.networkNodes.push(networkNodeUrl);
//     })
//     res.json({note: 'Bulk registration successful.'});
// })
//
// app.get('/consensus', function (req,res){
//     const requestPromises = [];
//     bitcoin.networkNodes.forEach(networkNodeUrl =>{
//         const requestOptions = {
//             uri: networkNodeUrl + "/blockchain",
//             method: 'GET',
//             json:true
//         }
//         requestPromises.push(rp(requestOptions));
//     })
//
//     Promise.all(requestPromises)
//         .then(blockchains=>{
//             const currentChainLength = bitcoin.chain.length;
//             let maxChainLength = currentChainLength;
//             let newLongestChain = null;
//             let newPendingTransactions = null;
//
//             blockchains.forEach(blockchain =>{
//                 if(blockchain.chain.length > maxChainLength){
//                     maxChainLength = blockchain.chain.length;
//                     newLongestChain = blockchain.chain;
//                     newPendingTransactions = blockchain.pendingTransactions;
//                 }
//             })
//
//             if(!newLongestChain || (newLongestChain && !bitcoin.chainIsValid(newLongestChain))){
//                 res.json({
//                     note:'Current chain has not been replaced',
//                     chain: bitcoin.chain
//                 });
//             }else{
//                 bitcoin.chain = newLongestChain;
//                 bitcoin.pendingTransactions = newPendingTransactions;
//                 res.json({
//                     note:'This chain has been replaced',
//                     chain:bitcoin.chain
//                 });
//             }
//         })
// });
//
// app.listen(port, function() {
//     console.log(`listening on port ${port}...`)
// });
