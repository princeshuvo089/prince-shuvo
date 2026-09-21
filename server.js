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

// Frontend UI
app.use(express.static(path.join(__dirname, 'public')));

// Upload API (Supports both code and files)
app.post('/upload', upload.any(), (req, res) => {
    try {
        let siteName = req.body.siteName ? req.body.siteName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') : '';
        if (!siteName) siteName = 'site-' + uuidv4().slice(0, 6);

        if (['upload', 'sites', 'public', 'api'].includes(siteName)) {
            return res.status(400).json({ success: false, error: 'অন্য একটি নাম দিন।' });
        }

        const targetDir = path.join(sitesDir, siteName);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.get('host');
        const liveUrl = `${protocol}://${host}/${siteName}`;

        // Case 1: Direct HTML Code typed
        if (req.body.htmlCode && req.body.htmlCode.trim().length > 0) {
            fs.writeFileSync(path.join(targetDir, 'index.html'), req.body.htmlCode.trim(), 'utf8');
            return res.json({ success: true, message: 'লাইভ হয়েছে!', url: liveUrl });
        }

        // Case 2: File uploaded
        const file = req.files && req.files.length > 0 ? req.files[0] : null;
        if (!file) {
            return res.status(400).json({ success: false, error: 'ফাইল বা কোড দিন।' });
        }

        const name = file.originalname.toLowerCase();
        if (name.endsWith('.zip')) {
            fs.createReadStream(file.path)
                .pipe(unzipper.Extract({ path: targetDir }))
                .on('close', () => {
                    fs.unlink(file.path, () => {});
                    res.json({ success: true, message: 'লাইভ হয়েছে!', url: liveUrl });
                })
                .on('error', () => {
                    fs.unlink(file.path, () => {});
                    res.status(500).json({ success: false, error: 'আনজিপ এরর।' });
                });
        } else if (name.endsWith('.html') || name.endsWith('.htm')) {
            fs.copyFileSync(file.path, path.join(targetDir, 'index.html'));
            fs.unlink(file.path, () => {});
            res.json({ success: true, message: 'লাইভ হয়েছে!', url: liveUrl });
        } else {
            fs.unlink(file.path, () => {});
            res.status(400).json({ success: false, error: 'শুধুমাত্র HTML বা ZIP।' });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: 'সার্ভার এরর।' });
    }
});

// Short URL routing: /sitename
app.get('/:siteName', (req, res, next) => {
    const p = path.join(sitesDir, req.params.siteName.toLowerCase());
    if (fs.existsSync(p)) return res.redirect(301, `/${req.params.siteName.toLowerCase()}/`);
    next();
});

app.use('/:siteName', (req, res, next) => {
    const p = path.join(sitesDir, req.params.siteName.toLowerCase());
    if (fs.existsSync(p)) return express.static(p)(req, res, next);
    next();
});

app.use('/sites', express.static(sitesDir));

app.listen(PORT, () => console.log('Server is running on port ' + PORT));
