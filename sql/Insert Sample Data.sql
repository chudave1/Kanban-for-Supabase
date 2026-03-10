-- Categories
delete from "Categories" ;

INSERT INTO "Categories"
(id, last_updated, "name", description, category_type)
VALUES(100, now(), 'School', 'Tasks for school', '');

INSERT INTO "Categories"
(id, last_updated, "name", description, category_type)
VALUES(101, now(), 'Sports', 'Tasks for sports', '');

INSERT INTO "Categories"
(id, last_updated, "name", description, category_type)
VALUES(102, now(), 'Church', 'Tasks for church', '');

INSERT INTO "Categories"
(id, last_updated, "name", description, category_type)
VALUES(103, now(), 'Home', 'Tasks for home', '');


SELECT id, last_updated, "name", description, category_type
FROM "Categories";


-- People
DELETE FROM "People";

INSERT INTO "People"
(id, last_updated, first_name, last_name, short_name, sms_number, email_address, "comment")
VALUES(100, now(), 'Fred', 'Flintstone', '@fredflintstone', 6194516662, 'fred@yahoo.com', 'Wife is Wilma');

INSERT INTO "People"
(id, last_updated, first_name, last_name, short_name, sms_number, email_address, "comment")
VALUES(101, now(), 'Barney', 'Rubble', '@barney123', 619431256, 'barneyr@yahoo.com', 'Wife is Betty');

INSERT INTO "People"
(id, last_updated, first_name, last_name, short_name, sms_number, email_address, "comment")
VALUES(102, now(), 'Bart', 'Simpson', '@bartsimpson', 9493005678, 'barts5678@gmail.com', 'Me');

SELECT id, last_updated, first_name, last_name, short_name, sms_number, email_address, "comment"
FROM "People";


-- Statuses
DELETE FROM "Status";

INSERT INTO "Status"
(id, last_updated, "name", description, status_type)
VALUES(100, now(), 'Pending assignment', 'Not assigned to anyone', 'To Do');

INSERT INTO "Status"
(id, last_updated, "name", description, status_type)
VALUES(101, now(), 'Assigned', 'Assigned with due date', 'To Do');

INSERT INTO "Status"
(id, last_updated, "name", description, status_type)
VALUES(102, now(), 'Work in progress', 'Being worked on', 'In Progress');

INSERT INTO "Status"
(id, last_updated, "name", description, status_type)
VALUES(103, now(), 'Work done', 'Done may need validation', 'In Progress');

INSERT INTO "Status"
(id, last_updated, "name", description, status_type)
VALUES(104, now(), 'Validation in progress', 'Being validated', 'In Progress');

INSERT INTO "Status"
(id, last_updated, "name", description, status_type)
VALUES(105, now(), 'Rejected', 'Failed validation', 'To Do');

INSERT INTO "Status"
(id, last_updated, "name", description, status_type)
VALUES(106, now(), 'Completed', 'All done', 'Done');

SELECT id, last_updated, "name", description, status_type
FROM "Status";


-- Sample Tasks
DELETE FROM "Tasks";

DELETE FROM "Tasks"
WHERE id=6;

INSERT INTO "Tasks"
(created_at, last_updated, description, due_date, "comments", assigned_to, prerequisite_id, category_id, status_id)
VALUES(now(), now(), 'Easter baskets for kids', TO_TIMESTAMP('2026/03/27 17:00:00', 'YYYY/MM/DD HH24:MI:SS'), null, 102, null, 102, 102);

INSERT INTO "Tasks"
(created_at, last_updated, description, due_date, "comments", assigned_to, prerequisite_id, category_id, status_id)
VALUES(now(), now(), 'Mark lines on baseball field', TO_TIMESTAMP('2026/03/17 12:00:00', 'YYYY/MM/DD HH24:MI:SS'), null, 100, null, 102, 101);

INSERT INTO "Tasks"
(created_at, last_updated, description, due_date, "comments", assigned_to, prerequisite_id, category_id, status_id)
VALUES(now(), now(), 'Mow grass and rake sand', TO_TIMESTAMP('2026/03/17 12:00:00', 'YYYY/MM/DD HH24:MI:SS'), null, 100, 4, 101, 101);

INSERT INTO "Tasks"
(created_at, last_updated, description, due_date, "comments", assigned_to, prerequisite_id, category_id, status_id)
VALUES(now(), now(), 'Science fair presentation', TO_TIMESTAMP('2026/03/10 14:00:00', 'YYYY/MM/DD HH24:MI:SS'), 'Request projector', 102, null, 100, 106);


SELECT t.id, t.created_at, t.last_updated, t.description, t.due_date, t."comments", p.short_name, c."name", s."name" 
FROM "Tasks" t
inner join "Categories" c on c.id = t.category_id 
inner join "People" p on p.id = t.assigned_to 
inner join "Status" s on s.id = t.status_id 


