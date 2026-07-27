// reportView.js
// Generates post-speech scorecard using Chart.js

export class ReportView {
    constructor() {
        this.viewElement = document.getElementById('report_view');
        this.dashboardView = document.getElementById('dashboard_view');
        
        this.valEye = document.getElementById('report_eye');
        this.valWpm = document.getElementById('report_wpm');
        this.insightList = document.getElementById('insight_list');
        this.btnNew = document.getElementById('btn_new_session');
        
        this.chartCanvas = document.getElementById('timeline_chart');
        this.chart = null;
        
        this.onNewSessionCallback = null;

        this.btnNew.addEventListener('click', () => {
            this.hide();
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
        const { avgEyeContact, avgWpm, timeline, avgSmile } = sessionData;
        
        this.valEye.textContent = `${Math.round(avgEyeContact)}%`;
        this.valWpm.innerHTML = `${Math.round(avgWpm)} <small>WPM</small>`;
        
        this.generateInsights(sessionData);
        this.renderChart(timeline);
    }

    generateInsights(data) {
        this.insightList.innerHTML = '';
        const insights = [];

        if (data.avgEyeContact < 70) {
            insights.push("Your eye contact was quite low. Try to look directly into the camera lens more often to engage your virtual audience.");
        } else {
            insights.push("Great job maintaining eye contact with the lens!");
        }

        if (data.avgWpm > 160) {
            insights.push("Your speaking pace was very fast. Try to slow down and use pauses to emphasize key points.");
        } else if (data.avgWpm < 110) {
            insights.push("Your pace was a bit slow. A conversational pace is typically 120-150 WPM.");
        } else {
            insights.push("Your speaking pace was in the ideal conversational range.");
        }
        
        if (data.avgSmile > 30) {
            insights.push("You maintained a positive expression (good smile ratio) throughout the pitch.");
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
