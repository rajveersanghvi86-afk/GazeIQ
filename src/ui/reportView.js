// reportView.js
// Generates post-speech scorecard using Chart.js

export class ReportView {
    constructor() {
        this.viewElement    = document.getElementById('report_view');
        this.dashboardView  = document.getElementById('dashboard_view');

        this.valEye       = document.getElementById('report_eye');
        this.valWpm       = document.getElementById('report_wpm');
        this.valFillers   = document.getElementById('report_fillers');
        this.valStability = document.getElementById('report_stability');
        this.valVolume    = document.getElementById('report_volume');
        this.valOverall   = document.getElementById('report_overall');

        this.insightList  = document.getElementById('insight_list');
        this.btnNew       = document.getElementById('btn_new_session');
        this.btnDownload  = document.getElementById('btn_download_video');

        this.chartCanvas  = document.getElementById('timeline_chart');
        this.chart        = null;

        this.onNewSessionCallback = null;

        this.btnNew.addEventListener('click', () => {
            this.hide();
            this.btnDownload.classList.add('hidden');
            if (this.onNewSessionCallback) this.onNewSessionCallback();
        });
    }

    show(sessionData) {
        this.dashboardView.classList.add('hidden');
        this.viewElement.classList.remove('hidden');
        this.render(sessionData);
    }

    hide() {
        this.viewElement.classList.add('hidden');
        this.dashboardView.classList.remove('hidden');
    }

    render(sessionData) {
        const {
            avgEyeContact,
            avgWpm,
            avgSmile,
            avgStability,
            avgVolume,
            totalFillers,
            timeline,
            videoUrl
        } = sessionData;

        // Stat cards
        this.valEye.textContent       = `${Math.round(avgEyeContact || 0)}%`;
        this.valWpm.innerHTML         = `${Math.round(avgWpm || 0)} <small>WPM</small>`;
        this.valFillers.textContent   = totalFillers || 0;
        this.valStability.textContent = `${Math.round(avgStability || 100)}%`;
        this.valVolume.textContent    = `${Math.round(avgVolume || 0)}%`;

        // Compute & display an overall score (0-100)
        const overall = this._computeOverall({ avgEyeContact, avgWpm, avgSmile, avgStability, avgVolume, totalFillers });
        this.valOverall.textContent = `${overall}/100`;
        this.valOverall.style.color = overall >= 75 ? '#4ade80' : overall >= 50 ? '#facc15' : '#ef4444';

        // Video download
        if (videoUrl) {
            this.btnDownload.classList.remove('hidden');
            this.btnDownload.onclick = () => {
                const a = document.createElement('a');
                a.href     = videoUrl;
                a.download = `GazeIQ_Pitch_${Date.now()}.webm`;
                a.click();
            };
        }

        this.generateInsights({ avgEyeContact, avgWpm, avgSmile, avgStability, avgVolume, totalFillers, overall });
        this.renderChart(timeline);
    }

    /**
     * Produces a weighted overall score from session metrics.
     * Weights: eye contact 30%, posture 20%, WPM 20%, volume 15%, fillers 15%
     */
    _computeOverall({ avgEyeContact, avgWpm, avgSmile, avgStability, avgVolume, totalFillers }) {
        const eyeScore   = Math.min(100, avgEyeContact || 0);
        const stabScore  = Math.min(100, avgStability || 100);
        // WPM ideal: 120-150; penalise deviations
        const wpmIdeal   = 135;
        const wpmScore   = Math.max(0, 100 - Math.abs((avgWpm || 0) - wpmIdeal) * 1.2);
        // Volume: ideal 30-75; outside = penalty
        const vol        = avgVolume || 0;
        const volScore   = vol > 5 && vol < 80 ? Math.min(100, vol * 1.3) : Math.max(0, 50 - Math.abs(vol - 40));
        // Filler penalty: -5 per filler over 2
        const fillerPenalty = Math.max(0, (totalFillers || 0) - 2) * 5;
        const fillerScore = Math.max(0, 100 - fillerPenalty);

        const raw = (
            eyeScore  * 0.30 +
            stabScore * 0.20 +
            wpmScore  * 0.20 +
            volScore  * 0.15 +
            fillerScore * 0.15
        );
        return Math.round(Math.min(100, raw));
    }

    generateInsights(data) {
        this.insightList.innerHTML = '';
        const insights = [];

        // Eye contact
        if (data.avgEyeContact < 55) {
            insights.push({ text: 'Your eye contact was quite low — look directly into the camera lens more often.', cls: 'bad' });
        } else if (data.avgEyeContact < 78) {
            insights.push({ text: 'Good eye contact overall. A few moments of looking away were detected.', cls: 'warn' });
        } else {
            insights.push({ text: '🎯 Excellent eye contact throughout your pitch!', cls: 'good' });
        }

        // Speech pace
        if (data.avgWpm > 165) {
            insights.push({ text: `You spoke very fast (~${Math.round(data.avgWpm)} WPM). Slow down and use deliberate pauses.`, cls: 'bad' });
        } else if (data.avgWpm < 105) {
            insights.push({ text: `Your pace was a bit slow (~${Math.round(data.avgWpm)} WPM). Ideal conversational speed is 120-150 WPM.`, cls: 'warn' });
        } else {
            insights.push({ text: `✅ Great speaking pace (~${Math.round(data.avgWpm)} WPM) — right in the conversational sweet spot.`, cls: 'good' });
        }

        // Filler words
        if (data.totalFillers > 8) {
            insights.push({ text: `You used ${data.totalFillers} filler words. Try replacing them with a confident pause.`, cls: 'bad' });
        } else if (data.totalFillers > 3) {
            insights.push({ text: `${data.totalFillers} filler words detected. You're on track — keep practising!`, cls: 'warn' });
        } else {
            insights.push({ text: '🗣️ Minimal filler words — very clean, confident delivery!', cls: 'good' });
        }

        // Posture stability
        if (data.avgStability && data.avgStability < 55) {
            insights.push({ text: 'High head movement detected. Plant your feet, ground your posture, and stay centred.', cls: 'bad' });
        } else if (data.avgStability && data.avgStability < 75) {
            insights.push({ text: 'Some head movement detected — try to keep a steadier, more grounded position.', cls: 'warn' });
        } else {
            insights.push({ text: '🧍 Excellent posture stability — you projected confidence and groundedness.', cls: 'good' });
        }

        // Vocal volume
        const vol = data.avgVolume || 0;
        if (vol < 8) {
            insights.push({ text: 'Your vocal volume was very low. Speak up — project your voice with confidence!', cls: 'bad' });
        } else if (vol > 82) {
            insights.push({ text: 'Your volume was very high. Consider bringing your energy down slightly for nuance.', cls: 'warn' });
        } else {
            insights.push({ text: '🔊 Good vocal energy and volume throughout your pitch.', cls: 'good' });
        }

        insights.forEach(({ text, cls }) => {
            const li = document.createElement('li');
            li.textContent = text;
            if (cls) li.classList.add(cls);
            this.insightList.appendChild(li);
        });
    }

    renderChart(timeline) {
        if (!window.Chart) { console.error('Chart.js not loaded'); return; }
        if (this.chart) { this.chart.destroy(); }

        const ctx    = this.chartCanvas.getContext('2d');
        const labels = timeline.map((_, i) => `${i}s`);

        this.chart = new window.Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Eye Contact (%)',
                        data: timeline.map(t => t.eyeContact),
                        borderColor: '#4ade80',
                        backgroundColor: 'rgba(74,222,128,0.08)',
                        tension: 0.4,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Posture Stability (%)',
                        data: timeline.map(t => t.postureStability),
                        borderColor: '#22d3ee',
                        backgroundColor: 'rgba(34,211,238,0.08)',
                        tension: 0.4,
                        borderDash: [5, 3],
                        yAxisID: 'y'
                    },
                    {
                        label: 'Speech Pace (WPM)',
                        data: timeline.map(t => t.wpm),
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59,130,246,0.08)',
                        tension: 0.4,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: {
                        grid:  { color: 'rgba(255,255,255,0.07)' },
                        ticks: { color: '#94a3b8', maxTicksLimit: 12 }
                    },
                    y: {
                        type: 'linear', display: true, position: 'left',
                        grid:  { color: 'rgba(255,255,255,0.07)' },
                        ticks: { color: '#94a3b8' },
                        min: 0, max: 100
                    },
                    y1: {
                        type: 'linear', display: true, position: 'right',
                        grid:  { drawOnChartArea: false },
                        ticks: { color: '#94a3b8' },
                        min: 0
                    }
                },
                plugins: {
                    legend: { labels: { color: '#f8fafc', boxWidth: 12 } }
                }
            }
        });
    }

    onNewSession(callback) { this.onNewSessionCallback = callback; }
}
