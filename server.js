const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const path = require('path');
const request = require('request');
const passwordHash = require('password-hash');
const session = require('express-session');

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public'))); // Ensure static files are served

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('./key.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = getFirestore();

app.use(session({
    secret: 'yourSecretKey',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

app.set('view engine', 'ejs');

app.get('/', (req, res) => {
    res.render('home');
});

// Login route
app.post('/loginSubmit', async (req, res) => {
    const { email, password } = req.body;

    try {
        if (!email || !password) {
            return res.status(400).send('Email and password are required.');
        }

        const usersData = await db.collection('users')
            .where('email', '==', email)
            .get();

        let verified = false;
        let user = null;

        usersData.forEach((doc) => {
            if (passwordHash.verify(password, doc.data().password)) {
                verified = true;
                user = doc.data();
            }
        });

        if (verified) {
            req.session.user = user;
            res.redirect('/dashboard');
        } else {
            res.send('Login failed...');
        }
    } catch (error) {
        console.error('Error during login:', error);
        res.send('Something went wrong...');
    }
});

// Signup route
app.post('/signupSubmit', async (req, res) => {
    const { username, email, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
        return res.send('Passwords do not match. Please try again.');
    }

    try {
        const usersData = await db.collection('users')
            .where('email', '==', email)
            .get();

        if (!usersData.empty) {
            return res.send('SORRY!!! This account already exists...');
        }

        await db.collection('users').add({
            userName: username,
            email: email,
            password: passwordHash.generate(password)
        });

        res.sendFile(path.join(__dirname, 'public', 'login.html'));
    } catch (error) {
        console.error('Error during signup:', error);
        res.send('Something went wrong...');
    }
});

// Dashboard route
app.get('/dashboard', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login.html');
    }

    const { userName: username } = req.session.user;
    const babyNames = req.session.babyNames || [];

    res.render('dashboard', {
        username: username,
        babyNames: babyNames
    });
});

// Fetch Baby Names Data Route
app.get('/getBabyNames', (req, res) => {
    const gender = req.query.gender;

    request.get({
        url:`https://api.api-ninjas.com/v1/babynames?gender=${gender}`,
        headers: {
            'X-Api-Key': 'fY1pz+pBq//yI6z9/+r9Pg==1aGt1OPa0woND1kv'
        },
    }, function (error, response, body) {
        if (error) return res.status(500).json({ error: 'Request failed' });
        else if (response.statusCode != 200) return res.status(response.statusCode).json({ error: 'Error fetching data' });
        else {
            try {
                const babyNames = JSON.parse(body);

                // Store data in session
                req.session.babyNames = babyNames;

                res.json({
                    babyNames: babyNames
                });
            } catch (error) {
                console.error('Error parsing baby names data:', error);
                res.status(500).json({ error: 'Error parsing data' });
            }
        }
    });
});

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});