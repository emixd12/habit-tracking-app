ALTER TABLE categories ADD COLUMN description TEXT CHECK (length(description) <= 2000);
UPDATE categories SET name = name || ' [' || id || ']'
WHERE id IN (SELECT id FROM (SELECT id, row_number() OVER (PARTITION BY user_id, lower(trim(name)) ORDER BY sort_order,id) AS ordinal FROM categories) WHERE ordinal > 1);
CREATE UNIQUE INDEX categories_owner_normalized_name ON categories(user_id,lower(trim(name)));

CREATE TRIGGER categories_validate_name_insert BEFORE INSERT ON categories
WHEN length(NEW.name) NOT BETWEEN 1 AND 120 OR NEW.name <> trim(NEW.name)
 OR NEW.name GLOB ('*[' || char(1) || '-' || char(31) || char(127) || ']*') OR instr(NEW.name,char(0)) > 0
BEGIN SELECT RAISE(ABORT,'Invalid category name.'); END;
CREATE TRIGGER categories_validate_name_update BEFORE UPDATE OF name ON categories
WHEN NEW.name <> OLD.name AND (length(NEW.name) NOT BETWEEN 1 AND 120 OR NEW.name <> trim(NEW.name)
 OR NEW.name GLOB ('*[' || char(1) || '-' || char(31) || char(127) || ']*') OR instr(NEW.name,char(0)) > 0)
BEGIN SELECT RAISE(ABORT,'Invalid category name.'); END;
