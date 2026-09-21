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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const uploadsDir = path.join(__dirname, 'uploads');
const sitesDir = path.join(__dirname, 'hosted_sites');

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(sitesDir)) fs.mkdirSync(sitesDir, { recursive: true });

const upload = multer({ dest: uploadsDir });

// ১. ফ্রন্টএন্ড UI
app.use(express.static(path.join(__dirname, 'public')));

// ২. ইউনিভার্সাল আপলোড API (সরাসরি কোড ও ফাইল উভয় সাপোর্ট করে)
app.post('/upload', upload.any(), (req, res) => {
    try {
        let siteName = req.body.siteName ? req.body.siteName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') : '';
        if (!siteName) {
            siteName = 'site-' + uuidv4().slice(0, 6);
        }

        if (['upload', 'sites', 'public', 'api'].includes(siteName)) {
            return res.status(400).json({ success: false, error: 'এই নামটি ব্যবহার করা যাবে না, অন্য নাম দিন।' });
        }

        const targetDir = path.join(sitesDir, siteName);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.get('host');
        const liveUrl = `${protocol}://${host}/${siteName}`;

        // সরাসরি কোড সাবমিট করলে
        if (req.body.htmlCode && req.body.htmlCode.trim().length > 0) {
            const destPath = path.join(targetDir, 'index.html');
            fs.writeFileSync(destPath, req.body.htmlCode.trim(), 'utf8');
            return res.json({
                success: true,
                message: 'কোড সফলভাবে হোস্ট ও লাইভ হয়েছে!',
                url: liveUrl
            });
        }

        // ফাইল আপলোড করলে
        const file = req.files && req.files.length > 0 ? req.files[0] : null;
        if (!file) {
            return res.status(400).json({ success: false, error: 'দয়া করে ফাইল সিলেক্ট করুন অথবা কোড লিখুন।' });
        }

        const originalName = file.originalname.toLowerCase();

        if (originalName.endsWith('.zip')) {
            fs.createReadStream(file.path)
                .pipe(unzipper.Extract({ path: targetDir }))
                .on('close', () => {
                    fs.unlink(file.path, () => {});
                    return res.json({
                        success: true,
                        message: 'ZIP ওয়েবসাইট সফলভাবে হোস্ট হয়েছে!',
                        url: liveUrl
                    });
                })
                .on('error', () => {
                    fs.unlink(file.path, () => {});
                    return res.status(500).json({ success: false, error: 'ZIP আনজিপ করতে সমস্যা হয়েছে।' });
                });
        } else if (originalName.endsWith('.html') || originalName.endsWith('.htm')) {
            const destPath = path.join(targetDir, 'index.html');
            fs.copyFileSync(file.path, destPath);
            fs.unlink(file.path, () => {});
            return res.json({
                success: true,
                message: 'HTML ফাইল সফলভাবে হোস্ট হয়েছে!',
                url: liveUrl
            });
        } else {
            fs.unlink(file.path, () => {});
            return res.status(400).json({ success: false, error: 'শুধুমাত্র .HTML অথবা .ZIP ফাইল সাপোর্ট করবে!' });
        }
    } catch (err) {
        return res.status(500).json({ success: false, error: 'সার্ভারে সমস্যা হয়েছে।' });
    }
});

// ৩. শর্ট ইউআরএল রাউটিং (/sitename)
app.get('/:siteName', (req, res, next) => {
    const siteName = req.params.siteName.toLowerCase();
    const sitePath = path.join(sitesDir, siteName);
    if (fs.existsSync(sitePath)) {
        return res.redirect(301, `/${siteName}/`);
    }
    next();
});

app.use('/:siteName', (req, res, next) => {
    const siteName = req.params.siteName.toLowerCase();
    const sitePath = path.join(sitesDir, siteName);
    if (fs.existsSync(sitePath)) {
        return express.static(sitePath)(req, res, next);
    }
    next();
});

app.use('/sites', express.static(sitesDir));

app.listen(PORT, () => {
    console.log(`PRINCE SHUVO Engine active on port ${PORT}`);
});
