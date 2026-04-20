(function () {
    var SUPABASE_URL = window.SUPABASE_URL;
    var SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;
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

    var boardColumnsByKey = null;

    var cachedPeopleRows = null;
    var cachedCategoryRows = null;
    var cachedTodoStatusRows = null;
    var cachedPrerequisiteCandidateRows = null;

    var selectedCard = null;
    var suppressCardClickAfterDrag = false;

    var taskModalMode = 'add'; // 'add' | 'edit'
    var editingTaskId = null;

    function updateTaskActionButtons() {
        var deleteBtn = document.getElementById('delete-task');
        var changeBtn = document.getElementById('change-task');
        var has = selectedCard && selectedCard.dataset && selectedCard.dataset.taskId;
        if (deleteBtn) {
            deleteBtn.disabled = !has;
        }
        if (changeBtn) {
            changeBtn.disabled = !has;
        }
    }

    function clearCardSelection() {
        if (selectedCard) {
            selectedCard.classList.remove('selected');
            selectedCard = null;
        }
        updateTaskActionButtons();
    }

    function toggleCardSelection(card) {
        if (!card || !card.dataset.taskId) {
            return;
        }
        if (selectedCard === card) {
            clearCardSelection();
            return;
        }
        if (selectedCard) {
            selectedCard.classList.remove('selected');
        }
        selectedCard = card;
        selectedCard.classList.add('selected');
        updateTaskActionButtons();
    }

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
            suppressCardClickAfterDrag = true;
            if (!pendingMoveTargetColumnKey) {
                currentDragTaskId = null;
                currentDragFromColumnKey = null;
                currentDragCard = null;
            }
        });

        card.addEventListener('click', function (e) {
            if (suppressCardClickAfterDrag) {
                suppressCardClickAfterDrag = false;
                return;
            }
            e.stopPropagation();
            toggleCardSelection(card);
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

        ensurePeopleRows(errorEl).then(function (ok) {
            if (ok && assignSelect) {
                populatePeopleSelect(assignSelect);
            }
        });
        loadStatusOptions();
    }

    var statusOptionsLoaded = false;

    async function ensurePeopleRows(errorEl) {
        if (cachedPeopleRows) {
            return true;
        }
        var supabase = getSupabaseClient();
        if (!supabase) {
            if (errorEl) {
                errorEl.textContent = 'Supabase client not available.';
            }
            return false;
        }

        try {
            var result = await supabase
                .from('People')
                .select('id, short_name');

            if (result.error) {
                if (errorEl) {
                    errorEl.textContent = 'Error loading people: ' + (result.error.message || '');
                }
                return false;
            }

            cachedPeopleRows = Array.isArray(result.data) ? result.data : [];
            return true;
        } catch (err) {
            if (errorEl) {
                errorEl.textContent = 'Error loading people.';
            }
            console.error('Error loading people options:', err);
            return false;
        }
    }

    function populatePeopleSelect(selectEl) {
        if (!selectEl) {
            return;
        }
        selectEl.innerHTML = '';
        var ph = document.createElement('option');
        ph.value = '';
        ph.textContent = 'Select a person…';
        selectEl.appendChild(ph);
        if (!cachedPeopleRows) {
            return;
        }
        cachedPeopleRows.forEach(function (row) {
            if (!row || row.id == null || !row.short_name) {
                return;
            }
            var opt = document.createElement('option');
            opt.value = String(row.id);
            opt.textContent = row.short_name;
            selectEl.appendChild(opt);
        });
    }

    async function ensureCategoryRows(errorEl) {
        if (cachedCategoryRows) {
            return true;
        }
        var supabase = getSupabaseClient();
        if (!supabase) {
            if (errorEl) {
                errorEl.textContent = 'Supabase client not available.';
            }
            return false;
        }

        try {
            var result = await supabase
                .from('Categories')
                .select('id, name')
                .order('name');

            if (result.error) {
                if (errorEl) {
                    errorEl.textContent = 'Error loading categories: ' + (result.error.message || '');
                }
                return false;
            }

            cachedCategoryRows = Array.isArray(result.data) ? result.data : [];
            return true;
        } catch (err) {
            if (errorEl) {
                errorEl.textContent = 'Error loading categories.';
            }
            console.error('Error loading categories:', err);
            return false;
        }
    }

    function populateCategorySelect(selectEl) {
        if (!selectEl) {
            return;
        }
        selectEl.innerHTML = '';
        var ph = document.createElement('option');
        ph.value = '';
        ph.textContent = 'Select a category…';
        selectEl.appendChild(ph);
        if (!cachedCategoryRows) {
            return;
        }
        cachedCategoryRows.forEach(function (row) {
            if (!row || row.id == null || !row.name) {
                return;
            }
            var opt = document.createElement('option');
            opt.value = String(row.id);
            opt.textContent = row.name;
            selectEl.appendChild(opt);
        });
    }

    async function ensureTodoStatusRows(errorEl) {
        if (cachedTodoStatusRows) {
            return true;
        }
        var supabase = getSupabaseClient();
        if (!supabase) {
            if (errorEl) {
                errorEl.textContent = 'Supabase client not available.';
            }
            return false;
        }

        try {
            var result = await supabase
                .from('Status')
                .select('id, name')
                .eq('status_type', 'To Do');

            if (result.error) {
                if (errorEl) {
                    errorEl.textContent = 'Error loading statuses: ' + (result.error.message || '');
                }
                return false;
            }

            cachedTodoStatusRows = Array.isArray(result.data) ? result.data : [];
            return true;
        } catch (err) {
            if (errorEl) {
                errorEl.textContent = 'Error loading statuses.';
            }
            console.error('Error loading To Do statuses:', err);
            return false;
        }
    }

    function populateTodoStatusSelect(selectEl) {
        if (!selectEl) {
            return;
        }
        selectEl.innerHTML = '';
        var ph = document.createElement('option');
        ph.value = '';
        ph.textContent = 'Select a status…';
        selectEl.appendChild(ph);
        if (!cachedTodoStatusRows) {
            return;
        }
        cachedTodoStatusRows.forEach(function (row) {
            if (!row || row.id == null || !row.name) {
                return;
            }
            var opt = document.createElement('option');
            opt.value = String(row.id);
            opt.textContent = row.name;
            selectEl.appendChild(opt);
        });
    }

    async function ensurePrerequisiteCandidateRows(errorEl) {
        if (cachedPrerequisiteCandidateRows) {
            return true;
        }
        var supabase = getSupabaseClient();
        if (!supabase) {
            if (errorEl) {
                errorEl.textContent = 'Supabase client not available.';
            }
            return false;
        }

        try {
            var result = await supabase
                .from(KANBAN_VIEW)
                .select('task_id, description, which_column')
                .in('which_column', ['To Do', 'In Progress'])
                .order('description');

            if (result.error) {
                if (errorEl) {
                    errorEl.textContent = 'Error loading prerequisite tasks: ' + (result.error.message || '');
                }
                return false;
            }

            cachedPrerequisiteCandidateRows = Array.isArray(result.data) ? result.data : [];
            return true;
        } catch (err) {
            if (errorEl) {
                errorEl.textContent = 'Error loading prerequisite tasks.';
            }
            console.error('Error loading prerequisite task options:', err);
            return false;
        }
    }

    function populatePrerequisiteSelect(selectEl, opts) {
        if (!selectEl) {
            return;
        }
        var excludeTaskId = opts && opts.excludeTaskId != null ? String(opts.excludeTaskId) : null;

        selectEl.innerHTML = '';
        var ph = document.createElement('option');
        ph.value = '';
        ph.textContent = 'None';
        selectEl.appendChild(ph);

        if (!cachedPrerequisiteCandidateRows) {
            return;
        }

        cachedPrerequisiteCandidateRows.forEach(function (row) {
            if (!row || row.task_id == null) {
                return;
            }
            var id = String(row.task_id);
            if (excludeTaskId && id === excludeTaskId) {
                return;
            }
            var desc = row.description != null ? String(row.description) : '(no description)';
            var which = row.which_column != null ? String(row.which_column) : '';
            var opt = document.createElement('option');
            opt.value = id;
            opt.textContent = which ? desc + ' (' + which + ')' : desc;
            selectEl.appendChild(opt);
        });
    }

    async function openAddTaskModal(mode, taskId) {
        var backdrop = document.getElementById('add-task-modal-backdrop');
        if (!backdrop) {
            return;
        }

        taskModalMode = mode === 'edit' ? 'edit' : 'add';
        editingTaskId = taskModalMode === 'edit' ? taskId : null;

        var titleEl = document.getElementById('add-task-modal-title');
        var errorEl = document.getElementById('add-task-modal-error');
        var categoryEl = document.getElementById('add-task-category');
        var descEl = document.getElementById('add-task-description');
        var dueEl = document.getElementById('add-task-due');
        var commentEl = document.getElementById('add-task-comment');
        var statusEl = document.getElementById('add-task-status');
        var prerequisiteEl = document.getElementById('add-task-prerequisite');
        var assignEl = document.getElementById('add-task-assign');

        if (titleEl) {
            titleEl.textContent = taskModalMode === 'edit' ? 'Change Task' : 'Add Task';
        }
        if (errorEl) {
            errorEl.textContent = '';
        }

        backdrop.hidden = false;

        if (!(await ensurePeopleRows(errorEl))) {
            return;
        }
        populatePeopleSelect(assignEl);

        if (!(await ensureCategoryRows(errorEl))) {
            return;
        }
        populateCategorySelect(categoryEl);

        if (!(await ensureTodoStatusRows(errorEl))) {
            return;
        }
        populateTodoStatusSelect(statusEl);

        if (!(await ensurePrerequisiteCandidateRows(errorEl))) {
            return;
        }
        populatePrerequisiteSelect(prerequisiteEl, { excludeTaskId: taskModalMode === 'edit' ? editingTaskId : null });

        if (taskModalMode === 'add') {
            if (descEl) descEl.value = '';
            if (dueEl) dueEl.value = '';
            if (commentEl) commentEl.value = '';
            if (assignEl) assignEl.value = '';
            if (categoryEl) categoryEl.value = '';
            if (statusEl) statusEl.value = '';
            if (prerequisiteEl) prerequisiteEl.value = '';
            return;
        }

        if (!editingTaskId) {
            if (errorEl) {
                errorEl.textContent = 'No task selected.';
            }
            return;
        }

        var supabase = getSupabaseClient();
        if (!supabase) {
            if (errorEl) {
                errorEl.textContent = 'Supabase client not available.';
            }
            return;
        }

        try {
            var result = await supabase
                .from('Tasks')
                .select('description, due_date, comments, category_id, status_id, assigned_to, prerequisite_id')
                .eq('id', editingTaskId)
                .single();

            if (result.error) {
                if (errorEl) {
                    errorEl.textContent = 'Error loading task: ' + (result.error.message || '');
                }
                return;
            }

            var row = result.data || {};
            if (descEl) descEl.value = row.description || '';
            if (commentEl) commentEl.value = row.comments || '';
            if (dueEl) {
                dueEl.value = row.due_date ? String(row.due_date).substring(0, 10) : '';
            }
            if (categoryEl) categoryEl.value = row.category_id != null ? String(row.category_id) : '';
            if (statusEl) statusEl.value = row.status_id != null ? String(row.status_id) : '';
            if (assignEl) assignEl.value = row.assigned_to != null ? String(row.assigned_to) : '';
            if (prerequisiteEl) prerequisiteEl.value = row.prerequisite_id != null ? String(row.prerequisite_id) : '';
        } catch (err) {
            console.error('Error loading task for edit:', err);
            if (errorEl) {
                errorEl.textContent = 'Unexpected error loading task.';
            }
        }
    }

    function closeAddTaskModal() {
        var backdrop = document.getElementById('add-task-modal-backdrop');
        var errorEl = document.getElementById('add-task-modal-error');
        if (backdrop) {
            backdrop.hidden = true;
        }
        if (errorEl) {
            errorEl.textContent = '';
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

            if (
                (currentDragFromColumnKey === 'To Do' && targetKey === 'In Progress') ||
                (currentDragFromColumnKey === 'In Progress' && targetKey === 'Done')
            ) {
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
        selectedCard = null;
        updateTaskActionButtons();

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

        boardColumnsByKey = columnsByKey;

        loadCardsFromSupabase(columnsByKey);

        var deleteTaskBtn = document.getElementById('delete-task');
        if (deleteTaskBtn) {
            deleteTaskBtn.addEventListener('click', async function () {
                if (!selectedCard || !selectedCard.dataset.taskId) {
                    return;
                }
                var taskId = selectedCard.dataset.taskId;
                var titleNode = selectedCard.querySelector('h3');
                var titleText = titleNode ? titleNode.textContent : 'this task';
                if (!window.confirm('Are you sure you want to delete this task?\n\n' + titleText)) {
                    return;
                }

                var supabase = getSupabaseClient();
                if (!supabase) {
                    setStatus('Supabase client not available.', true);
                    return;
                }

                if (deleteTaskBtn) {
                    deleteTaskBtn.disabled = true;
                }

                try {
                    var result = await supabase
                        .from('Tasks')
                        .delete()
                        .eq('id', taskId);

                    if (result.error) {
                        setStatus('Error deleting task: ' + (result.error.message || ''), true);
                        if (deleteTaskBtn) {
                            deleteTaskBtn.disabled = false;
                        }
                        updateTaskActionButtons();
                    } else {
                        clearCardSelection();
                        if (boardColumnsByKey) {
                            loadCardsFromSupabase(boardColumnsByKey);
                        }
                    }
                } catch (err) {
                    console.error('Error deleting task:', err);
                    setStatus('Unexpected error deleting task.', true);
                    if (deleteTaskBtn) {
                        deleteTaskBtn.disabled = false;
                    }
                    updateTaskActionButtons();
                }
            });
        }

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

        var addTaskOpen = document.getElementById('add-task-open');
        var changeTaskBtn = document.getElementById('change-task');
        var addTaskCancel = document.getElementById('add-task-cancel');
        var addTaskSave = document.getElementById('add-task-save');
        var addTaskBackdrop = document.getElementById('add-task-modal-backdrop');

        if (addTaskOpen) {
            addTaskOpen.addEventListener('click', function () {
                openAddTaskModal('add');
            });
        }

        if (changeTaskBtn) {
            changeTaskBtn.addEventListener('click', function () {
                if (!selectedCard || !selectedCard.dataset.taskId) {
                    return;
                }
                openAddTaskModal('edit', selectedCard.dataset.taskId);
            });
        }

        if (addTaskCancel) {
            addTaskCancel.addEventListener('click', function () {
                closeAddTaskModal();
            });
        }

        if (addTaskBackdrop) {
            addTaskBackdrop.addEventListener('click', function (e) {
                if (e.target === addTaskBackdrop) {
                    closeAddTaskModal();
                }
            });
        }

        if (addTaskSave) {
            addTaskSave.addEventListener('click', async function () {
                var errorEl = document.getElementById('add-task-modal-error');
                var categoryEl = document.getElementById('add-task-category');
                var descEl = document.getElementById('add-task-description');
                var dueEl = document.getElementById('add-task-due');
                var commentEl = document.getElementById('add-task-comment');
                var statusEl = document.getElementById('add-task-status');
                var prerequisiteEl = document.getElementById('add-task-prerequisite');
                var assignEl = document.getElementById('add-task-assign');

                var categoryId = categoryEl ? categoryEl.value : '';
                var description = descEl ? descEl.value.trim() : '';
                var dueRaw = dueEl ? dueEl.value : '';
                var comment = commentEl ? commentEl.value.trim() : '';
                var statusId = statusEl ? statusEl.value : '';
                var prerequisiteTaskId = prerequisiteEl ? prerequisiteEl.value : '';
                var assignedToId = assignEl ? assignEl.value : '';

                if (errorEl) {
                    errorEl.textContent = '';
                }

                if (!categoryId) {
                    if (errorEl) {
                        errorEl.textContent = 'Please select a category.';
                    }
                    return;
                }
                if (!description) {
                    if (errorEl) {
                        errorEl.textContent = 'Please enter a description.';
                    }
                    return;
                }
                if (!dueRaw) {
                    if (errorEl) {
                        errorEl.textContent = 'Please select a due date.';
                    }
                    return;
                }
                if (!statusId) {
                    if (errorEl) {
                        errorEl.textContent = 'Please select a status.';
                    }
                    return;
                }

                var saveBtn = addTaskSave;
                if (saveBtn) {
                    saveBtn.disabled = true;
                }
                if (addTaskCancel) {
                    addTaskCancel.disabled = true;
                }

                try {
                    var supabase = getSupabaseClient();
                    if (!supabase) {
                        if (errorEl) {
                            errorEl.textContent = 'Supabase client not available.';
                        }
                    } else {
                        var insertPayload = {
                            description: description,
                            due_date: dueRaw + 'T00:00:00',
                            category_id: Number(categoryId),
                            status_id: Number(statusId)
                        };

                        if (comment) {
                            insertPayload.comments = comment;
                        } else {
                            insertPayload.comments = null;
                        }

                        if (assignedToId) {
                            insertPayload.assigned_to = Number(assignedToId);
                        } else {
                            insertPayload.assigned_to = null;
                        }

                        if (prerequisiteTaskId) {
                            insertPayload.prerequisite_id = Number(prerequisiteTaskId);
                        } else {
                            insertPayload.prerequisite_id = null;
                        }

                        var op = supabase.from('Tasks');
                        var result;
                        if (taskModalMode === 'edit' && editingTaskId) {
                            result = await op
                                .update(insertPayload)
                                .eq('id', editingTaskId);
                        } else {
                            result = await op
                                .insert(insertPayload);
                        }

                        if (result.error) {
                            if (errorEl) {
                                errorEl.textContent = 'Error saving task: ' + (result.error.message || '');
                            }
                        } else {
                            closeAddTaskModal();
                            taskModalMode = 'add';
                            editingTaskId = null;
                            if (boardColumnsByKey) {
                                loadCardsFromSupabase(boardColumnsByKey);
                            }
                        }
                    }
                } catch (err) {
                    console.error('Error inserting task:', err);
                    if (errorEl) {
                        errorEl.textContent = 'Unexpected error saving task.';
                    }
                } finally {
                    if (saveBtn) {
                        saveBtn.disabled = false;
                    }
                    if (addTaskCancel) {
                        addTaskCancel.disabled = false;
                    }
                }
            });
        }
    });
})();
