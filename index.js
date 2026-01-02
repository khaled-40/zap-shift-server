const express = require('express')
const cors = require('cors')

// console.log(stripe)
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const stripe = require('stripe')(`${process.env.STRIPE_SECRET}`);
const app = express()
const port = process.env.port || 3000;
const crypto = require("crypto");

var admin = require("firebase-admin");

var serviceAccount = require("./zap-shift-d9d89-firebase-adminsdk-fbsvc-2bc8acd007.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});


function generateTrackingId() {
    const prefix = "PRCL"; // your brand prefix
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
    const random = crypto.randomBytes(3).toString("hex").toUpperCase(); // 6-char random hex

    return `${prefix}-${date}-${random}`;
}


// middleware
app.use(cors())
app.use(express.json())

const verifyFBToken = async (req, res, next) => {
    console.log(req.headers.authorization);
    const token = req.headers.authorization;
    if (!token) {
        return res.status(401).send({ message: 'unauthorized access' })
    }

    try {
        const idToken = token.split(' ')[1];
        const decoded = await admin.auth().verifyIdToken(idToken);
        // console.log('after decoded', decoded)
        req.decoded_email = decoded.email;
        next()
    } catch (err) {
        res.status(401).send({ message: 'unauthorized access' });
    }
}

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
        const paymentCollections = db.collection('payments');
        const userCollections = db.collection('users');
        const riderCollections = db.collection('riders');


        // Rider related API 
        app.get('/riders/:id', async(req,res) => {
            const id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const result = await riderCollections.findOne(query);
            res.send(result)
        })

        app.patch('/riders/:id', async (req, res) => {
            const status = req.body.status;
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: status
                }
            }
            const result = await riderCollections.updateOne(query, updateDoc);

            if (status === 'approved') {
                const email = req.body.email;
                const useQuery = { email };
                const updateUserRole = {
                    $set: {
                        role:'rider'
                    }
                };
                const userResult = await userCollections.updateOne(useQuery, updateUserRole)
            }

            res.send(result)
        })


        app.get('/riders', async (req, res) => {
            const query = {};
            if (req.query.status) {
                query.status = req.query.status
            }
            const cursor = riderCollections.find(query);
            const result = await cursor.toArray();
            res.send(result);
        })

        app.post('/riders', async (req, res) => {
            const rider = req.body;
            console.log(rider);
            rider.status = 'pending';
            rider.appliedAt = new Date();

            // const email = rider.email;

            // const riderExist = await riderCollections.findOne({email})
            // if(riderExist) {
            //     return res.send({message: 'rider already exist'})
            // }

            const result = await riderCollections.insertOne(rider)
            res.send(result)

        })


        // User related API 

        app.get('/user',verifyFBToken, async(req, res) => {
            const cursor = userCollections.find();
            const result = await cursor.toArray();
            res.send(result)
        })

        app.post('/user', async (req, res) => {
            const user = req.body;
            console.log(user)
            user.role = 'user';
            user.createAt = new Date();

            const email = req.body.email;

            const userExist = await userCollections.findOne({ email })

            if (userExist) {
                return res.send({ message: 'user exists' })
            }

            const result = await userCollections.insertOne(user);
            res.send(result)
        })


        // Parcel related API 
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
        app.get('/payments', verifyFBToken, async (req, res) => {
            const email = req.query.email;

            console.log(req.headers)
            const query = {};
            if (email) {
                query.customerEmail = email;
                if (email !== req.decoded_email) {
                    return res.status(403).send({ message: 'forbidden access' })
                }
            }
            const cursor = paymentCollections.find(query).sort({ paidAt: -1 });
            const result = await cursor.toArray();
            res.send(result)
        })
        app.post('/create-checkout-session', async (req, res) => {
            const paymentInfo = req.body;
            const amount = parseInt(paymentInfo.cost) * 100;
            const session = await stripe.checkout.sessions.create({
                line_items: [
                    {
                        // Provide the exact Price ID (for example, price_1234) of the product you want to sell
                        price_data: {
                            currency: 'USD',
                            unit_amount: amount,
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
                    parcelName: paymentInfo.parcelName,
                },
                success_url: `${process.env.HOST_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.HOST_DOMAIN}/dashboard/payment-cancelled`,
            })
            // console.log(session)
            res.send({ url: session.url });
        })

        app.patch('/payment-success', async (req, res) => {
            const sessionId = req.query.session_id;
            console.log('after call', sessionId)
            const session = await stripe.checkout.sessions.retrieve(sessionId);
            console.log('after retrieve', session.payment_intent)
            const transactionId = session.payment_intent;


            const query = { transactionId: transactionId };
            const paymentExist = await paymentCollections.findOne(query);

            if (paymentExist) {

                return res.send({
                    message: 'payment has already been processed',
                    transactionId: transactionId,
                    trackingId: paymentExist.trackingId
                })
            }

            if (session.payment_status === 'paid') {
                const id = session.metadata.parcelId;
                const query = { _id: new ObjectId(id) };
                const trackingId = generateTrackingId();
                const update = {
                    $set: {
                        paymentStatus: 'paid',
                        trackingId: trackingId
                    }
                }
                const result = await parcelCollections.updateOne(query, update);

                const payment = {
                    amount: session.amount_total / 100,
                    currency: session.currency,
                    customerEmail: session.customer_email,
                    parcelId: session.metadata.parcelId,
                    parcelName: session.metadata.parcelName,
                    transactionId: session.payment_intent,
                    paidAt: new Date(),
                    trackingId: trackingId
                }

                if (session.payment_status === 'paid') {
                    const resultPayment = await paymentCollections.insertOne(payment);
                    res.send({
                        success: true,
                        modifyParcel: result,
                        trackingId: trackingId,
                        transactionId: session.payment_intent,
                        paymentInfo: resultPayment
                    })
                }
            }
            res.send({ success: false })
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
