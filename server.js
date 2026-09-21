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

// যেকোনো ফিল্ড নামের ফাইল রিসিভ করার কনফিগারেশন
const upload = multer({ dest: uploadsDir });

app.use(express.static(path.join(__dirname, 'public')));
app.use('/sites', express.static(sitesDir));

// Universal Upload API
app.post('/upload', upload.any(), (req, res) => {
    // যেকোনো ফিল্ডে ফাইল আসলেই রিসিভ করবে
    const file = req.files && req.files.length > 0 ? req.files[0] : null;

    if (!file) {
        return res.status(400).json({ success: false, error: 'কোনো ফাইল পাওয়া যায়নি। দয়া করে ফাইল সিলেক্ট করুন।' });
    }

    let siteName = req.body.siteName ? req.body.siteName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') : '';
    if (!siteName) {
        siteName = 'site-' + uuidv4().slice(0, 6);
    }

    const targetDir = path.join(sitesDir, siteName);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    const originalName = file.originalname.toLowerCase();
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const liveUrl = `${protocol}://${host}/sites/${siteName}/index.html`;

    // ১. যদি ZIP ফাইল হয়
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
    // ২. যদি HTML ফাইল হয়
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
    // অন্য ফাইল
    else {
        fs.unlink(file.path, () => {});
        return res.status(400).json({ success: false, error: 'শুধুমাত্র .HTML অথবা .ZIP ফাইল আপলোড করতে পারবেন।' });
    }
});

app.listen(PORT, () => {
    console.log(`PRINCE SHUVO Cloud Server running on port ${PORT}`);
});
