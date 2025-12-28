const express = require('express')
const cors = require('cors')

// console.log(stripe)
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const stripe = require('stripe')(`${process.env.STRIPE_SECRET}`);
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

        app.get('/parcels/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await parcelCollections.findOne(query);
            res.send(result)
        })

        app.get('/parcels', async (req, res) => {
            const query = {};
            const { email } = req.query;
            if (email) {
                query.senderEmail = email
            }

            const options = { sort: { createdAt: -1 } }

            const cursor = parcelCollections.find(query, options);
            const result = await cursor.toArray();
            res.send(result)
        })

        app.post('/parcels', async (req, res) => {
            const parcel = req.body;
            parcel.createdAt = new Date();
            const result = await parcelCollections.insertOne(parcel);
            res.send(result)
        })

        app.delete('/parcels/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await parcelCollections.deleteOne(query);
            res.send(result)
        })

        // Payment related API 
        app.post('/create-checkout-session', async (req, res) => {
            const paymentInfo = req.body;
            const amount = parseInt(paymentInfo.cost) *100;
            const session = await stripe.checkout.sessions.create({
                line_items: [
                    {
                        // Provide the exact Price ID (for example, price_1234) of the product you want to sell
                        price_data : {
                            currency:'USD',
                            unit_amount : amount,
                            product_data: {
                                name: paymentInfo.parcelName,
                            }
                        },
                        quantity: 1,
                    },
                ],
                customer_email: paymentInfo.senderEmail,
                mode: 'payment',
                metadata: {
                    parcelId: paymentInfo.parcelId,
                },
                success_url: `${process.env.HOST_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.HOST_DOMAIN}/dashboard/payment-cancelled`,
            })
            console.log(session)
            res.send({url: session.url});
        })

        app.patch('/payment-success', async (req,res) => {
            const sessionId = req.query.session_id;
            console.log('after call', sessionId)
            const session = await stripe.checkout.sessions.retrieve(sessionId);
            console.log('after retrieve',session)
            if(session.payment_status === 'paid') {
                const id = session.metadata.parcelId;
                const query = {_id:new ObjectId(id)};
                const update = {
                    $set: {
                        paymentStatus: 'paid',
                    }
                }
                const result = await parcelCollections.updateOne(query,update);
                res.send(result);
            }
            res.send({success: false})
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
