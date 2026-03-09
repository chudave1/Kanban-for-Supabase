
drop view kanbanview;

CREATE OR REPLACE VIEW public.KanbanView
AS 
SELECT s.status_type as which_column, t.id as task_id, t.last_updated as last_updated, t.description, t.due_date, t."comments" as task_comments, 
	t.prerequisite_id as prerequisite_task,  p.short_name as assigned_to, c."name" as category, s."name" as status
FROM "Tasks" t
inner join "Categories" c on c.id = t.category_id 
inner join "People" p on p.id = t.assigned_to 
inner join "Status" s on s.id = t.status_id
;


SELECT which_column, task_id, last_updated, description, due_date, task_comments, prerequisite_task, assigned_to, category, status
FROM kanbanview;