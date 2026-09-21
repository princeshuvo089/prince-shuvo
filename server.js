const express = require('express');
const multer = require('multer');
const unzipper = require('unzipper');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const uploadsDir = path.join(__dirname, 'uploads');
const sitesDir = path.join(__dirname, 'hosted_sites');

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(sitesDir)) fs.mkdirSync(sitesDir, { recursive: true });

const upload = multer({ dest: uploadsDir });

// ১. ফ্রন্টএন্ড স্ট্যাটিক UI
app.use(express.static(path.join(__dirname, 'public')));

// ২. ইউনিভার্সাল আপলোড API (সরাসরি কোড ও ফাইল উভয়ই সাপোর্ট করে)
app.post('/upload', upload.any(), (req, res) => {
    try {
        let siteName = req.body.siteName ? req.body.siteName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') : '';
        if (!siteName) {
            siteName = 'site-' + Math.random().toString(36).substring(2, 8);
        }

        // রিজার্ভ নাম প্রোটেকশন
        if (['upload', 'sites', 'public', 'api'].includes(siteName)) {
            return res.status(400).json({ success: false, error: 'এই নামটি ব্যবহার করা যাবে না, অন্য নাম দিন।' });
        }

        const targetDir = path.join(sitesDir, siteName);

        // 👉 ১ নম্বর ফিচার: একই নাম আগে থেকে থাকলে ব্লক করা ও এরর মেসেজ দেওয়া
        if (fs.existsSync(targetDir)) {
            if (req.files && req.files.length > 0) {
                fs.unlink(req.files[0].path, () => {});
            }
            return res.status(400).json({ 
                success: false, 
                error: `⚠️ "${siteName}" নামটি ইতিমধ্যে অন্য কেউ নিয়ে নিয়েছে! নামের সাথে কোনো সংখ্যা (যেমন: ${siteName}1 বা ${siteName}26) যোগ করে আবার চেষ্টা করুন।` 
            });
        }

        // নতুন ফোল্ডার তৈরি
        fs.mkdirSync(targetDir, { recursive: true });

        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.get('host');
        const liveUrl = `${protocol}://${host}/${siteName}`;

        // কেস ১: যদি সরাসরি কোড লিখে পাঠায়
        if (req.body.htmlCode && req.body.htmlCode.trim().length > 0) {
            fs.writeFileSync(path.join(targetDir, 'index.html'), req.body.htmlCode.trim(), 'utf8');
            return res.json({ success: true, message: 'কোড সফলভাবে হোস্ট ও লাইভ হয়েছে!', url: liveUrl });
        }

        // কেস ২: যদি ফাইল আপলোড করে
        const file = req.files && req.files.length > 0 ? req.files[0] : null;
        if (!file) {
            return res.status(400).json({ success: false, error: 'দয়া করে ফাইল সিলেক্ট করুন অথবা কোড লিখুন।' });
        }

        const name = file.originalname.toLowerCase();

        if (name.endsWith('.zip')) {
            fs.createReadStream(file.path)
                .pipe(unzipper.Extract({ path: targetDir }))
                .on('close', () => {
                    fs.unlink(file.path, () => {});
                    res.json({ success: true, message: 'ZIP সফলভাবে হোস্ট হয়েছে!', url: liveUrl });
                })
                .on('error', () => {
                    fs.unlink(file.path, () => {});
                    res.status(500).json({ success: false, error: 'ZIP ফাইল আনজিপ করতে সমস্যা হয়েছে।' });
                });
        } else if (name.endsWith('.html') || name.endsWith('.htm')) {
            fs.copyFileSync(file.path, path.join(targetDir, 'index.html'));
            fs.unlink(file.path, () => {});
            res.json({ success: true, message: 'HTML ফাইল সফলভাবে হোস্ট হয়েছে!', url: liveUrl });
        } else {
            fs.unlink(file.path, () => {});
            res.status(400).json({ success: false, error: 'শুধুমাত্র .HTML অথবা .ZIP ফাইল দিন।' });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: 'সার্ভারে অভ্যন্তরীণ সমস্যা হয়েছে।' });
    }
});

// ৩. ক্লিন শর্ট লিংক রাউটিং (/sitename)
app.use('/:siteName', (req, res, next) => {
    const siteName = req.params.siteName.toLowerCase();
    const targetDir = path.join(sitesDir, siteName);
    if (fs.existsSync(targetDir)) {
        return express.static(targetDir)(req, res, next);
    }
    next();
});

app.use('/sites', express.static(sitesDir));

app.listen(PORT, () => {
    console.log('Server is active on port ' + PORT);
});
