CREATE TABLE IF NOT EXISTS site_pages (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(64) NOT NULL,
  title_es VARCHAR(200) NOT NULL,
  title_en VARCHAR(200) NOT NULL,
  body_md_es MEDIUMTEXT NOT NULL,
  body_md_en MEDIUMTEXT NOT NULL,
  updated_by_admin_id BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_site_pages_slug (slug),
  CONSTRAINT fk_site_pages_admin FOREIGN KEY (updated_by_admin_id) REFERENCES admins (id) ON DELETE SET NULL
);

INSERT INTO site_pages (slug, title_es, title_en, body_md_es, body_md_en)
SELECT
  'terminos',
  'Términos y condiciones',
  'Terms and conditions',
  '# Términos y condiciones

Última actualización: septiembre 2026.

## 1. Quiénes somos
DOMINA ofrece talleres presenciales. Al reservar un lugar aceptas estos términos.

## 2. Reservas y pagos
- El pago con tarjeta confirma tu lugar de inmediato.
- El pago con OXXO genera un voucher; tu lugar queda pendiente hasta que el efectivo se confirme.
- Los precios se muestran en MXN salvo que indiquemos otra moneda.

## 3. Cancelaciones
Si una edición no alcanza el mínimo de inscripción, DOMINA puede reprogramarla o reembolsar según la política vigente.

## 4. Conducta
Participas de forma respetuosa y segura en el salón de práctica.

## 5. Contacto
Escríbenos desde tu cuenta o al correo de operaciones de DOMINA.',
  '# Terms and conditions

Last updated: September 2026.

## 1. Who we are
DOMINA runs in-person workshops. By reserving a seat you accept these terms.

## 2. Reservations and payments
- Card payment confirms your seat immediately.
- OXXO payment creates a voucher; your seat stays pending until cash clears.
- Prices are shown in MXN unless stated otherwise.

## 3. Cancellations
If an edition does not reach the minimum enrollment, DOMINA may reschedule or refund per the current policy.

## 4. Conduct
You participate respectfully and safely in the practice room.

## 5. Contact
Reach us from your account or DOMINA operations email.'
WHERE NOT EXISTS (SELECT 1 FROM site_pages WHERE slug = 'terminos');

INSERT INTO site_pages (slug, title_es, title_en, body_md_es, body_md_en)
SELECT
  'privacidad',
  'Política de privacidad',
  'Privacy policy',
  '# Política de privacidad

Última actualización: septiembre 2026.

## Datos que usamos
Recopilamos nombre, correo, teléfono opcional y datos de inscripción para operar talleres y pagos.

## Pagos
DOMINA no almacena números de tarjeta. El procesamiento lo realiza un proveedor de pagos certificado.

## Uso
Usamos tus datos para autenticarte, confirmar tu lugar, enviarte avisos del taller y cumplir obligaciones legales.

## Conservación
Conservamos datos de inscripción el tiempo necesario para operación y requisitos fiscales.

## Tus derechos
Puedes solicitar acceso o corrección de tus datos desde tu ficha o contactando a DOMINA.',
  '# Privacy policy

Last updated: September 2026.

## Data we use
We collect name, email, optional phone, and enrollment data to run workshops and payments.

## Payments
DOMINA does not store card numbers. Payments are processed by a certified payment provider.

## Use
We use your data to authenticate you, confirm your seat, send workshop notices, and meet legal duties.

## Retention
We keep enrollment data as needed for operations and tax requirements.

## Your rights
You may request access or correction from your profile or by contacting DOMINA.'
WHERE NOT EXISTS (SELECT 1 FROM site_pages WHERE slug = 'privacidad');
