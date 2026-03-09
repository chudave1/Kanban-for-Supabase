(function () {
    // TODO: Replace these placeholders with your actual Supabase project URL and anon key.
    var SUPABASE_URL = 'https://lnzpyjgjclevbckwivnp.supabase.co';
    var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxuenB5amdqY2xldmJja3dpdm5wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNzk3OTYsImV4cCI6MjA4ODY1NTc5Nn0.IFYlWVZTDEPVshavbApnNxI-BL6YT--FbDvB0LUZXlU';
    var KANBAN_VIEW = 'kanbanview';

    var categoryClassByName = {
        School: 'cat-school',
        Home: 'cat-home',
        Church: 'cat-church',
        Sports: 'cat-sports'
    };

    var columns = [];

    function setColumns(colList) {
        columns = colList;
    }

    function clearDragOver() {
        columns.forEach(function (col) { col.classList.remove('drag-over'); });
    }

    function getColumn(node) {
        return node && node.closest ? node.closest('.column') : null;
    }

    function attachCardDnD(card) {
        card.addEventListener('dragstart', function (e) {
            if (!e.dataTransfer) return;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', card.dataset.taskId || '');
            card.classList.add('dragging');
        });

        card.addEventListener('dragend', function () {
            card.classList.remove('dragging');
            clearDragOver();
        });

        card.addEventListener('dragover', function (e) {
            e.preventDefault();
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'move';
            }
            var col = getColumn(card);
            if (col) {
                col.classList.add('drag-over');
            }
        });

        card.addEventListener('drop', function (e) {
            e.preventDefault();
            e.stopPropagation();
            clearDragOver();
            var dragging = document.querySelector('.card.dragging');
            var col = getColumn(card);
            if (dragging && col) {
                col.appendChild(dragging);
            }
        });
    }

    function attachColumnDnD(column) {
        column.addEventListener('dragover', function (e) {
            e.preventDefault();
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'move';
            }
            column.classList.add('drag-over');
        });

        column.addEventListener('dragleave', function (e) {
            if (!column.contains(e.relatedTarget)) {
                column.classList.remove('drag-over');
            }
        });

        column.addEventListener('drop', function (e) {
            e.preventDefault();
            clearDragOver();
            var dragging = document.querySelector('.card.dragging');
            if (dragging) {
                column.appendChild(dragging);
            }
        });
    }

    function escapeHtml(text) {
        if (text == null) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function renderKanbanBoard(rows, columnsByKey) {
        columns.forEach(function (column) {
            var existingCards = column.querySelectorAll('.card');
            existingCards.forEach(function (card) { card.remove(); });
        });

        rows.forEach(function (row) {
            var columnKey = row.which_column || 'To Do';
            var column = columnsByKey[columnKey] || columnsByKey['To Do'] || columns[0];
            if (!column) return;

            var card = document.createElement('div');
            card.className = 'card';
            card.draggable = true;

            if (row.task_id != null) {
                card.dataset.taskId = String(row.task_id);
            }

            var categoryClass = categoryClassByName[row.category] || 'cat-default';
            card.classList.add(categoryClass);

            var title = escapeHtml(row.description || '(no description)');
            var metaPieces = [];
            if (row.assigned_to) metaPieces.push('Assigned: ' + escapeHtml(row.assigned_to));
            if (row.category) metaPieces.push('Category: ' + escapeHtml(row.category));
            if (row.due_date) {
                var dueRaw = String(row.due_date);
                var dueShort = escapeHtml(dueRaw.substring(0, 10));
                metaPieces.push('Due: ' + dueShort);
            }
            if (row.status) {
                metaPieces.push('Status: ' + escapeHtml(row.status));
            }
            var meta = metaPieces.join(' • ');

            card.innerHTML = '<h3>' + title + '</h3>' +
                (meta ? '<p>' + meta + '</p>' : '');

            column.appendChild(card);
            attachCardDnD(card);
        });
    }

    function setStatus(msg, isError) {
        var el = document.getElementById('board-status');
        if (!el) return;
        el.textContent = msg || '';
        el.className = 'board-status' + (isError ? ' board-status-error' : '');
    }

    async function loadCardsFromSupabase(columnsByKey) {
        if (!window.supabase || !window.supabase.createClient) {
            setStatus('Supabase client library not found.', true);
            return;
        }

        setStatus('Loading…');

        var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        try {
            var result = await supabase
                .from(KANBAN_VIEW)
                .select('*');

            if (result.error) {
                setStatus('Error: ' + (result.error.message || JSON.stringify(result.error)), true);
                console.error('Error loading Kanban data:', result.error);
                return;
            }

            var data = result.data != null && Array.isArray(result.data) ? result.data : [];
            renderKanbanBoard(data, columnsByKey);
            setStatus(data.length === 0 ? 'No tasks found.' : '');
        } catch (err) {
            var msg = err && err.message ? err.message : String(err);
            setStatus('Error: ' + msg, true);
            console.error('Unexpected error loading Kanban data:', err);
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        var columnNodes = Array.prototype.slice.call(document.querySelectorAll('.column'));
        setColumns(columnNodes);

        var columnsByKey = {};
        columnNodes.forEach(function (column) {
            var key = column.getAttribute('data-column');
            if (key) {
                columnsByKey[key] = column;
            }
            attachColumnDnD(column);
        });

        loadCardsFromSupabase(columnsByKey);
    });
})();
