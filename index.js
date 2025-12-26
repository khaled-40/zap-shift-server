const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const app = express()
const port = process.env.port || 3000;


// middleware
app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.uk3n3pp.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const db = client.db('zap_shift_db');
        const parcelCollections = db.collection('parcels');

        // app.get('/parcels' async (req, res) => {

        // })

        app.get('/parcels', async(req,res) => {
            const query = {};
            const {email} = req.query;
            if(email) {
                query.senderEmail = email
            }

            const options = {sort : {createdAt: -1}}

            const cursor = parcelCollections.find(query,options);
            const result = await cursor.toArray();
            res.send(result)
        })

        app.post('/parcels', async (req, res) => {
            const parcel = req.body;
            parcel.createdAt = new Date();
            const result = await parcelCollections.insertOne(parcel);
            res.send(result)
        })

        app.delete('/parcels/:id', async(req,res) => {
            const id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const result = await parcelCollections.deleteOne(query);
            res.send(result)
        })



        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Zap is shifting shifting!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
