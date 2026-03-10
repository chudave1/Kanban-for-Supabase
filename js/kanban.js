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
    var supabaseClient = null;

    var currentDragTaskId = null;
    var currentDragFromColumnKey = null;
    var currentDragCard = null;
    var pendingMoveTargetColumnKey = null;

    function setColumns(colList) {
        columns = colList;
    }

    function clearDragOver() {
        columns.forEach(function (col) { col.classList.remove('drag-over'); });
    }

    function getColumn(node) {
        return node && node.closest ? node.closest('.column') : null;
    }

    function getSupabaseClient() {
        if (!window.supabase || !window.supabase.createClient) {
            return null;
        }
        if (!supabaseClient) {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        }
        return supabaseClient;
    }

    function updateCardMetaFromDataset(card) {
        var metaPieces = [];
        var assignedTo = card.dataset.assignedTo;
        var category = card.dataset.category;
        var dueDate = card.dataset.dueDate;
        var status = card.dataset.status;

        if (assignedTo) metaPieces.push('Assigned: ' + escapeHtml(assignedTo));
        if (category) metaPieces.push('Category: ' + escapeHtml(category));
        if (dueDate) {
            var dueShort = escapeHtml(String(dueDate).substring(0, 10));
            metaPieces.push('Due: ' + dueShort);
        }
        if (status) metaPieces.push('Status: ' + escapeHtml(status));

        var meta = metaPieces.join(' • ');
        var p = card.querySelector('p');
        if (meta) {
            if (!p) {
                p = document.createElement('p');
                card.appendChild(p);
            }
            p.innerHTML = meta;
        } else if (p) {
            p.remove();
        }
    }

    function attachCardDnD(card) {
        card.addEventListener('dragstart', function (e) {
            if (!e.dataTransfer) return;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', card.dataset.taskId || '');
            card.classList.add('dragging');

            var col = getColumn(card);
            var colKey = col && col.getAttribute('data-column');
            currentDragTaskId = card.dataset.taskId || null;
            currentDragFromColumnKey = colKey || null;
            currentDragCard = card;
        });

        card.addEventListener('dragend', function () {
            card.classList.remove('dragging');
            clearDragOver();
            if (!pendingMoveTargetColumnKey) {
                currentDragTaskId = null;
                currentDragFromColumnKey = null;
                currentDragCard = null;
            }
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

        // Drop handling is managed at the column level so we can
        // detect moves between specific columns (e.g., To Do → In Progress).
    }

    function openMoveToInProgressModal(taskId, targetColumnKey) {
        var backdrop = document.getElementById('move-modal-backdrop');
        if (!backdrop) return;

        var titleEl = document.getElementById('move-modal-title');
        var summaryEl = document.getElementById('move-modal-task-summary');
        var commentEl = document.getElementById('move-comment');
        var assignSelect = document.getElementById('move-assign-to');
        var statusSelect = document.getElementById('move-status');
        var errorEl = document.getElementById('move-modal-error');

        pendingMoveTargetColumnKey = targetColumnKey || 'In Progress';

        if (titleEl) {
            titleEl.textContent = 'Update Task for ' + pendingMoveTargetColumnKey;
        }

        if (summaryEl && currentDragCard) {
            var titleNode = currentDragCard.querySelector('h3');
            var titleText = titleNode ? titleNode.textContent : '(no description)';
            summaryEl.textContent = 'Task: ' + titleText;
        }

        if (commentEl) commentEl.value = '';
        if (assignSelect) assignSelect.value = '';
        if (statusSelect) statusSelect.value = '';
        if (errorEl) errorEl.textContent = '';

        backdrop.hidden = false;

        loadPeopleOptions();
        loadStatusOptions();
    }

    var peopleOptionsLoaded = false;
    var statusOptionsLoaded = false;

    async function loadPeopleOptions() {
        if (peopleOptionsLoaded) return;
        var supabase = getSupabaseClient();
        var selectEl = document.getElementById('move-assign-to');
        var errorEl = document.getElementById('move-modal-error');
        if (!supabase || !selectEl) return;

        try {
            var result = await supabase
                .from('People')
                .select('id, short_name');

            if (result.error) {
                if (errorEl) {
                    errorEl.textContent = 'Error loading people: ' + (result.error.message || '');
                }
                return;
            }

            var data = Array.isArray(result.data) ? result.data : [];
            data.forEach(function (row) {
                if (!row || row.id == null || !row.short_name) return;
                var opt = document.createElement('option');
                opt.value = String(row.id);
                opt.textContent = row.short_name;
                selectEl.appendChild(opt);
            });

            peopleOptionsLoaded = true;
        } catch (err) {
            if (errorEl) {
                errorEl.textContent = 'Error loading people.';
            }
            console.error('Error loading people options:', err);
        }
    }

    async function loadStatusOptions() {
        if (statusOptionsLoaded) return;
        var supabase = getSupabaseClient();
        var selectEl = document.getElementById('move-status');
        var errorEl = document.getElementById('move-modal-error');
        if (!supabase || !selectEl) return;

        try {
            var result = await supabase
                .from('Status')
                .select('id, name')
                .eq('status_type', 'In Progress');

            if (result.error) {
                if (errorEl) {
                    errorEl.textContent = 'Error loading statuses: ' + (result.error.message || '');
                }
                return;
            }

            var data = Array.isArray(result.data) ? result.data : [];
            data.forEach(function (row) {
                if (!row || row.id == null || !row.name) return;
                var opt = document.createElement('option');
                opt.value = String(row.id);
                opt.textContent = row.name;
                selectEl.appendChild(opt);
            });

            statusOptionsLoaded = true;
        } catch (err) {
            if (errorEl) {
                errorEl.textContent = 'Error loading statuses.';
            }
            console.error('Error loading status options:', err);
        }
    }

    function closeMoveModal() {
        var backdrop = document.getElementById('move-modal-backdrop');
        var errorEl = document.getElementById('move-modal-error');
        if (backdrop) {
            backdrop.hidden = true;
        }
        if (errorEl) {
            errorEl.textContent = '';
        }
        currentDragTaskId = null;
        currentDragFromColumnKey = null;
        currentDragCard = null;
        pendingMoveTargetColumnKey = null;
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
            if (!dragging) return;

            var targetKey = column.getAttribute('data-column');

            if (currentDragFromColumnKey === 'To Do' && targetKey === 'In Progress') {
                openMoveToInProgressModal(currentDragTaskId, targetKey);
                return;
            }

            column.appendChild(dragging);
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

            if (row.assigned_to != null) {
                card.dataset.assignedTo = String(row.assigned_to);
            }
            if (row.category != null) {
                card.dataset.category = String(row.category);
            }
            if (row.due_date != null) {
                card.dataset.dueDate = String(row.due_date);
            }
            if (row.status != null) {
                card.dataset.status = String(row.status);
            }

            var title = escapeHtml(row.description || '(no description)');
            card.innerHTML = '<h3>' + title + '</h3>';
            updateCardMetaFromDataset(card);

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
        var supabase = getSupabaseClient();
        if (!supabase) {
            setStatus('Supabase client library not found.', true);
            return;
        }

        setStatus('Loading…');

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

        var saveBtn = document.getElementById('move-save');
        var cancelBtn = document.getElementById('move-cancel');
        var backdrop = document.getElementById('move-modal-backdrop');

        if (cancelBtn) {
            cancelBtn.addEventListener('click', function () {
                closeMoveModal();
            });
        }

        if (backdrop) {
            backdrop.addEventListener('click', function (e) {
                if (e.target === backdrop) {
                    closeMoveModal();
                }
            });
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', async function () {
                var errorEl = document.getElementById('move-modal-error');
                var commentEl = document.getElementById('move-comment');
                var assignSelect = document.getElementById('move-assign-to');
                var statusSelect = document.getElementById('move-status');

                if (!currentDragTaskId || !currentDragCard) {
                    if (errorEl) {
                        errorEl.textContent = 'No task selected.';
                    }
                    return;
                }

                var comment = commentEl ? commentEl.value.trim() : '';
                var assignedToId = assignSelect ? assignSelect.value : '';
                var statusId = statusSelect ? statusSelect.value : '';
                var assignedToOption = assignSelect && assignSelect.selectedIndex >= 0
                    ? assignSelect.options[assignSelect.selectedIndex]
                    : null;
                var statusOption = statusSelect && statusSelect.selectedIndex >= 0
                    ? statusSelect.options[statusSelect.selectedIndex]
                    : null;
                var assignedToName = assignedToOption ? assignedToOption.textContent : '';
                var statusName = statusOption ? statusOption.textContent : '';

                if (errorEl) {
                    errorEl.textContent = '';
                }

                var saveButton = saveBtn;
                if (saveButton) {
                    saveButton.disabled = true;
                }
                if (cancelBtn) {
                    cancelBtn.disabled = true;
                }

                try {
                    var supabase = getSupabaseClient();
                    if (!supabase) {
                        if (errorEl) {
                            errorEl.textContent = 'Supabase client not available.';
                        }
                    } else {
                        var updatePayload = {};

                        if (comment) {
                            updatePayload.comments = comment;
                        }
                        if (assignedToId) {
                            updatePayload.assigned_to = Number(assignedToId);
                        }
                        if (statusId) {
                            updatePayload.status_id = Number(statusId);
                        }

                        var result = await supabase
                            .from('Tasks')
                            .update(updatePayload)
                            .eq('id', currentDragTaskId);

                        if (result.error) {
                            if (errorEl) {
                                errorEl.textContent = 'Error saving task: ' + (result.error.message || '');
                            }
                        } else {
                            if (assignedToName) {
                                currentDragCard.dataset.assignedTo = assignedToName;
                            }
                            if (statusName) {
                                currentDragCard.dataset.status = statusName;
                            }

                            updateCardMetaFromDataset(currentDragCard);

                            var targetColumn = pendingMoveTargetColumnKey && columnsByKey[pendingMoveTargetColumnKey];
                            if (!targetColumn) {
                                targetColumn = columnsByKey['In Progress'] || columns[1] || currentDragCard.parentNode;
                            }
                            if (targetColumn) {
                                targetColumn.appendChild(currentDragCard);
                            }

                            closeMoveModal();
                        }
                    }
                } catch (err) {
                    console.error('Error updating task:', err);
                    if (errorEl) {
                        errorEl.textContent = 'Unexpected error saving task.';
                    }
                } finally {
                    if (saveButton) {
                        saveButton.disabled = false;
                    }
                    if (cancelBtn) {
                        cancelBtn.disabled = false;
                    }
                }
            });
        }
    });
})();
