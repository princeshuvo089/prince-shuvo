const express = require('express');
const multer = require('multer');
const unzipper = require('unzipper');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ফোল্ডার না থাকলে স্বয়ংক্রিয়ভাবে তৈরি হবে
const uploadsDir = path.join(__dirname, 'uploads');
const sitesDir = path.join(__dirname, 'hosted_sites');

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(sitesDir)) fs.mkdirSync(sitesDir, { recursive: true });

// ফাইল আপলোড কনফিগারেশন
const upload = multer({ dest: uploadsDir });

// ১. ফ্রন্টএন্ড UI সার্ভ করা
app.use(express.static(path.join(__dirname, 'public')));

// ২. ইউজারদের হোস্ট করা সাইট লাইভ করার রাউট
app.use('/sites', express.static(sitesDir));

// ৩. সাইট আপলোড করার API
app.post('/upload', upload.single('websiteZip'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'দয়া করে একটি ZIP ফাইল সিলেক্ট করুন।' });
    }

    // সাইটের নাম ক্লিন করা
    let siteName = req.body.siteName ? req.body.siteName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') : '';
    if (!siteName) {
        siteName = 'site-' + uuidv4().slice(0, 6);
    }

    const targetDir = path.join(sitesDir, siteName);

    // ZIP আনজিপ করে ফোল্ডারে রাখা
    fs.createReadStream(req.file.path)
        .pipe(unzipper.Extract({ path: targetDir }))
        .on('close', () => {
            // টেম্পোরারি ফাইল ডিলিট
            fs.unlink(req.file.path, () => {});

            // লাইভ লিংক তৈরি
            const protocol = req.headers['x-forwarded-proto'] || req.protocol;
            const host = req.get('host');
            const liveUrl = `${protocol}://${host}/sites/${siteName}/index.html`;

            res.json({
                success: true,
                message: 'ওয়েবসাইট সফলভাবে হোস্ট হয়েছে!',
                url: liveUrl
            });
        })
        .on('error', (err) => {
            fs.unlink(req.file.path, () => {});
            res.status(500).json({ success: false, error: 'ফাইল আনজিপ করতে সমস্যা হয়েছে।' });
        });
});

app.listen(PORT, () => {
    console.log(`PRINCE SHUVO Hosting Server running on port ${PORT}`);
});
