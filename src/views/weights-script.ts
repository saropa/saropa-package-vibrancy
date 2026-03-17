/** Client-side JavaScript for the scoring weights webview. */
export function getWeightsScript(): string {
    return `
(function() {
    const vscode = acquireVsCodeApi();

    const sliderRV = document.getElementById('slider-rv');
    const sliderEL = document.getElementById('slider-el');
    const sliderPop = document.getElementById('slider-pop');
    const valueRV = document.getElementById('value-rv');
    const valueEL = document.getElementById('value-el');
    const valuePop = document.getElementById('value-pop');
    const sumEl = document.getElementById('weight-sum');
    const tbody = document.getElementById('pkg-body');

    const DEFAULT_RV = 0.5;
    const DEFAULT_EL = 0.4;
    const DEFAULT_POP = 0.1;

    function clamp(v) {
        return Math.min(100, Math.max(0, v));
    }

    function calcScore(rv, el, pop, netBonus, wR, wE, wP) {
        const raw = wR * rv + wE * el + wP * pop + netBonus;
        return Math.round(clamp(raw) * 10) / 10;
    }

    function categoryFromScore(score) {
        if (score >= 70) { return 'vibrant'; }
        if (score >= 40) { return 'quiet'; }
        if (score >= 10) { return 'legacy-locked'; }
        return 'end-of-life';
    }

    function categoryLabel(cat) {
        switch (cat) {
            case 'vibrant': return 'Vibrant';
            case 'quiet': return 'Quiet';
            case 'legacy-locked': return 'Legacy-Locked';
            case 'end-of-life': return 'End of Life';
            default: return cat;
        }
    }

    function formatDelta(delta) {
        if (delta > 0) {
            return '<span class="delta-positive">+' + delta.toFixed(1) + '</span>';
        }
        if (delta < 0) {
            return '<span class="delta-negative">' + delta.toFixed(1) + '</span>';
        }
        return '<span class="delta-zero">0</span>';
    }

    function updateAll() {
        const wR = parseFloat(sliderRV.value);
        const wE = parseFloat(sliderEL.value);
        const wP = parseFloat(sliderPop.value);

        valueRV.textContent = wR.toFixed(2);
        valueEL.textContent = wE.toFixed(2);
        valuePop.textContent = wP.toFixed(2);

        var sum = wR + wE + wP;
        var sumRounded = Math.round(sum * 100) / 100;
        sumEl.textContent = 'Sum: ' + sumRounded.toFixed(2);
        if (Math.abs(sum - 1.0) < 0.02) {
            sumEl.className = 'sum-indicator sum-ok';
        } else {
            sumEl.className = 'sum-indicator sum-warn';
        }

        var rows = tbody.querySelectorAll('tr');
        rows.forEach(function(row) {
            var rv = parseFloat(row.dataset.rv);
            var el = parseFloat(row.dataset.el);
            var pop = parseFloat(row.dataset.pop);
            var netBonus = parseFloat(row.dataset.netbonus);
            var currentScore = parseFloat(row.dataset.currentscore);

            var newScore = calcScore(rv, el, pop, netBonus, wR, wE, wP);
            var delta = Math.round((newScore - currentScore) * 10) / 10;
            var cat = categoryFromScore(newScore);
            var catClass = 'cat-' + cat;

            // Update live score attribute so sorting uses the recalculated value
            row.dataset.score = newScore.toFixed(1);
            row.querySelector('.score-cell').innerHTML =
                newScore.toFixed(1) + ' ' + formatDelta(delta);
            var badge = row.querySelector('.category-badge');
            badge.textContent = categoryLabel(cat);
            badge.className = 'category-badge ' + catClass;
        });
    }

    sliderRV.addEventListener('input', updateAll);
    sliderEL.addEventListener('input', updateAll);
    sliderPop.addEventListener('input', updateAll);

    document.getElementById('btn-reset').addEventListener('click', function() {
        sliderRV.value = DEFAULT_RV;
        sliderEL.value = DEFAULT_EL;
        sliderPop.value = DEFAULT_POP;
        updateAll();
    });

    document.getElementById('btn-apply').addEventListener('click', function() {
        vscode.postMessage({
            type: 'applyWeights',
            weights: {
                resolutionVelocity: parseFloat(sliderRV.value),
                engagementLevel: parseFloat(sliderEL.value),
                popularity: parseFloat(sliderPop.value),
            },
        });
    });

    // Sorting
    // Sort by live score (updated by updateAll) rather than static currentscore
    var sortCol = 'score';
    var sortAsc = false;

    function sortTable(col) {
        if (sortCol === col) {
            sortAsc = !sortAsc;
        } else {
            sortCol = col;
            sortAsc = true;
        }
        var rows = Array.from(tbody.querySelectorAll('tr'));
        rows.sort(function(a, b) {
            var av = a.dataset[col] || '';
            var bv = b.dataset[col] || '';
            var an = parseFloat(av);
            var bn = parseFloat(bv);
            if (!isNaN(an) && !isNaN(bn)) {
                return sortAsc ? an - bn : bn - an;
            }
            return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
        });
        rows.forEach(function(r) { tbody.appendChild(r); });
        updateArrows();
    }

    function updateArrows() {
        document.querySelectorAll('th[data-col]').forEach(function(th) {
            var arrow = th.querySelector('.sort-arrow');
            if (th.dataset.col === sortCol) {
                arrow.textContent = sortAsc ? ' \\u25B2' : ' \\u25BC';
            } else {
                arrow.textContent = '';
            }
        });
    }

    document.querySelectorAll('th[data-col]').forEach(function(th) {
        th.addEventListener('click', function() { sortTable(th.dataset.col); });
    });

    // Initial render with current weights
    updateAll();
})();
    `;
}
