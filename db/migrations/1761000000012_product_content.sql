-- Up Migration

-- Shared product page content, set by super_admin in the catalogue and the same in every branch.
-- images holds object-storage keys in display order; the first one is the cover on product cards.
-- specs is an ordered list of {label, value} rows shown under the description.
ALTER TABLE products
  ADD COLUMN description text NOT NULL DEFAULT '',
  ADD COLUMN images text[] NOT NULL DEFAULT '{}',
  ADD COLUMN specs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT products_images_max CHECK (cardinality(images) <= 8),
  ADD CONSTRAINT products_specs_array CHECK (jsonb_typeof(specs) = 'array');

-- Down Migration

ALTER TABLE products
  DROP CONSTRAINT products_specs_array,
  DROP CONSTRAINT products_images_max,
  DROP COLUMN specs,
  DROP COLUMN images,
  DROP COLUMN description;
