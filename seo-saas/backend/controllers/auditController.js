const Audit = require('../models/Audit');
const { runLighthouseAudit } = require('../utils/lighthouse');

exports.runAudit = async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({
                message: 'URL is required'
            });
        }

        const auditResult = await runLighthouseAudit(url);

        const audit = await Audit.create({
            userId: req.userId,
            url: auditResult.url,
            performanceScore: auditResult.performanceScore,
            seoScore: auditResult.seoScore,
            accessibilityScore: auditResult.accessibilityScore,
            bestPracticesScore: auditResult.bestPracticesScore,
            fullReport: auditResult.fullReport
        });

        return res.status(201).json({
            audit
        });
    } catch (error) {
        console.error('Audit run error:', error);
        return res.status(500).json({
            message:
                error.message ||
                'Failed to run SEO audit'
        });
    }
};

exports.getHistory = async (req, res) => {
    try {
        const audits = await Audit.find({
            userId: req.userId
        })
            .sort({ createdAt: -1 })
            .limit(50)
            .select('-fullReport');

        return res.json({
            audits
        });
    } catch (error) {
        console.error('Audit history error:', error);
        return res.status(500).json({
            message: 'Failed to load audit history'
        });
    }
};

exports.getAudit = async (req, res) => {
    try {
        const audit = await Audit.findOne({
            _id: req.params.id,
            userId: req.userId
        });

        if (!audit) {
            return res.status(404).json({
                message: 'Audit not found'
            });
        }

        return res.json({
            audit
        });
    } catch (error) {
        return res.status(500).json({
            message: 'Failed to load audit'
        });
    }
};
