module.exports = {
    blockchain: (req,res) => {
        const context = {
            chain : req.instance.chain,
            pendingTransactions: req.instance.pendingTransactions,
            currentNodeUrl: req.instance.currentNodeUrl,
            networkNodes: req.instance.networkNodes
        }
        console.log(req.instance)
        res.render('blockInfo', context, (err,html) =>{
            if(err)
                throw err;
            res.end(html)
        })
    }
}