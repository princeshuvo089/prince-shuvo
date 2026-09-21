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

const uploadsDir = path.join(__dirname, 'uploads');
const sitesDir = path.join(__dirname, 'hosted_sites');

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(sitesDir)) fs.mkdirSync(sitesDir, { recursive: true });

const upload = multer({ dest: uploadsDir });

// ১. মূল হোস্টিং প্ল্যাটফর্মের ফ্রন্টএন্ড
app.use(express.static(path.join(__dirname, 'public')));

// ২. ফাইল আপলোড API
app.post('/upload', upload.any(), (req, res) => {
    const file = req.files && req.files.length > 0 ? req.files[0] : null;

    if (!file) {
        return res.status(400).json({ success: false, error: 'কোনো ফাইল পাওয়া যায়নি। দয়া করে ফাইল সিলেক্ট করুন।' });
    }

    let siteName = req.body.siteName ? req.body.siteName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') : '';
    if (!siteName) {
        siteName = 'site-' + uuidv4().slice(0, 6);
    }

    // রিজার্ভ নাম ব্লক করা
    if (siteName === 'upload' || siteName === 'sites' || siteName === 'public') {
        return res.status(400).json({ success: false, error: 'এই নামটি ব্যবহার করা যাবে না, অন্য নাম দিন।' });
    }

    const targetDir = path.join(sitesDir, siteName);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    const originalName = file.originalname.toLowerCase();
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');

    // 👉 শর্ট ও ক্লিন লাইভ লিংক (যেমন: https://princeshuvo.onrender.com/sitename)
    const liveUrl = `${protocol}://${host}/${siteName}`;

    // ZIP ফাইল প্রসেস
    if (originalName.endsWith('.zip')) {
        fs.createReadStream(file.path)
            .pipe(unzipper.Extract({ path: targetDir }))
            .on('close', () => {
                fs.unlink(file.path, () => {});
                res.json({
                    success: true,
                    message: 'ZIP ওয়েবসাইট সফলভাবে হোস্ট হয়েছে!',
                    url: liveUrl
                });
            })
            .on('error', (err) => {
                fs.unlink(file.path, () => {});
                res.status(500).json({ success: false, error: 'ZIP ফাইল আনজিপ করতে সমস্যা হয়েছে।' });
            });
    } 
    // HTML ফাইল প্রসেস
    else if (originalName.endsWith('.html') || originalName.endsWith('.htm')) {
        const destPath = path.join(targetDir, 'index.html');
        fs.copyFile(file.path, destPath, (err) => {
            fs.unlink(file.path, () => {});
            if (err) {
                return res.status(500).json({ success: false, error: 'HTML ফাইল সেভ করতে ব্যর্থ হয়েছে।' });
            }
            res.json({
                success: true,
                message: 'HTML ফাইল সফলভাবে হোস্ট হয়েছে!',
                url: liveUrl
            });
        });
    } 
    else {
        fs.unlink(file.path, () => {});
        return res.status(400).json({ success: false, error: 'শুধুমাত্র .HTML অথবা .ZIP ফাইল সাপোর্ট করবে!' });
    }
});

// ৩. সরাসরি ডাইনামিক শর্ট ইউআরএল রাউটিং (/sitename)
app.get('/:siteName', (req, res, next) => {
    const siteName = req.params.siteName.toLowerCase();
    const sitePath = path.join(sitesDir, siteName);

    // ফোল্ডার থাকলে ট্রেইলিং স্ল্যাশসহ রিডাইরেক্ট করবে যাতে CSS/JS ফাইল সঠিকভাবে কাজ করে
    if (fs.existsSync(sitePath)) {
        return res.redirect(301, `/${siteName}/`);
    }
    next();
});

// ৪. ইউজারের সাইটের সমস্ত ফাইল লাইভ সার্ভ করা
app.use('/:siteName', (req, res, next) => {
    const siteName = req.params.siteName.toLowerCase();
    const sitePath = path.join(sitesDir, siteName);

    if (fs.existsSync(sitePath)) {
        return express.static(sitePath)(req, res, next);
    }
    next();
});

// পেছনের সাপোর্ট (/sites/sitename)
app.use('/sites', express.static(sitesDir));

app.listen(PORT, () => {
    console.log(`PRINCE SHUVO Engine active on port ${PORT}`);
});
