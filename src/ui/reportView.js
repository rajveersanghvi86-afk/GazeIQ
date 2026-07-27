// reportView.js
// Generates post-speech scorecard using Chart.js

export class ReportView {
    constructor() {
        this.viewElement = document.getElementById('report_view');
        this.dashboardView = document.getElementById('dashboard_view');
        
        this.valEye = document.getElementById('report_eye');
        this.valWpm = document.getElementById('report_wpm');
        this.valFillers = document.getElementById('report_fillers');
        this.valStability = document.getElementById('report_stability');
        
        this.insightList = document.getElementById('insight_list');
        this.btnNew = document.getElementById('btn_new_session');
        this.btnDownload = document.getElementById('btn_download_video');
        
        this.chartCanvas = document.getElementById('timeline_chart');
        this.chart = null;
        
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
        const { avgEyeContact, avgWpm, timeline, avgSmile, totalFillers, avgStability, videoUrl } = sessionData;
        
        this.valEye.textContent = `${Math.round(avgEyeContact)}%`;
        this.valWpm.innerHTML = `${Math.round(avgWpm)} <small>WPM</small>`;
        this.valFillers.textContent = totalFillers || 0;
        this.valStability.textContent = `${Math.round(avgStability || 100)}%`;
        
        if (videoUrl) {
            this.btnDownload.classList.remove('hidden');
            this.btnDownload.onclick = () => {
                const a = document.createElement('a');
                a.href = videoUrl;
                a.download = `GazeIQ_Pitch_${new Date().getTime()}.webm`;
                a.click();
            };
        }
        
        this.generateInsights(sessionData);
        this.renderChart(timeline);
    }

    generateInsights(data) {
        this.insightList.innerHTML = '';
        const insights = [];

        if (data.avgEyeContact < 70) {
            insights.push("Your eye contact was quite low. Try to look directly into the camera lens more often.");
        } else {
            insights.push("Great job maintaining eye contact with the lens!");
        }

        if (data.avgWpm > 160) {
            insights.push("Your speaking pace was very fast. Try to slow down and use pauses.");
        } else if (data.avgWpm < 110) {
            insights.push("Your pace was a bit slow. A conversational pace is typically 120-150 WPM.");
        } else {
            insights.push("Your speaking pace was in the ideal conversational range.");
        }
        
        if (data.totalFillers > 5) {
            insights.push(`You used ${data.totalFillers} filler words. Try replacing them with short pauses.`);
        }
        
        if (data.avgStability && data.avgStability < 60) {
            insights.push("You displayed high head jitter (swaying/bobbing). Try planting your feet and grounding your posture.");
        }

        insights.forEach(text => {
            const li = document.createElement('li');
            li.textContent = text;
            this.insightList.appendChild(li);
        });
    }

    renderChart(timeline) {
        if (!window.Chart) {
            console.error("Chart.js not loaded");
            return;
        }

        if (this.chart) {
            this.chart.destroy();
        }

        const ctx = this.chartCanvas.getContext('2d');
        const labels = timeline.map((_, i) => `${i}s`);
        const eyeData = timeline.map(t => t.eyeContact);
        const wpmData = timeline.map(t => t.wpm);

        this.chart = new window.Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Eye Contact (%)',
                        data: eyeData,
                        borderColor: '#4ade80',
                        backgroundColor: 'rgba(74, 222, 128, 0.1)',
                        tension: 0.4,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Speech Pace (WPM)',
                        data: wpmData,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        tension: 0.4,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255,255,255,0.1)' },
                        ticks: { color: '#94a3b8' }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        grid: { color: 'rgba(255,255,255,0.1)' },
                        ticks: { color: '#94a3b8' },
                        min: 0,
                        max: 100
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        grid: { drawOnChartArea: false },
                        ticks: { color: '#94a3b8' },
                        min: 0
                    }
                },
                plugins: {
                    legend: {
                        labels: { color: '#f8fafc' }
                    }
                }
            }
        });
    }

    onNewSession(callback) {
        this.onNewSessionCallback = callback;
    }
}
