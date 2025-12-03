export const FORM_JSON = {
  "id": "solar_onboarding_v1",
  "title": "Solar Connect Onboarding",
  "version": 1,
  "locale": "en-IN",
  "description": "Structured data collection for solar panel installation",
  "flow": [
    {
      "order": 1,
      "id": "full_name",
      "type": "text",
      "required": true,
      "presentation": "inline",
      "placeholder": "e.g., Rajesh Kumar",
      "validation": {
        "minLength": 2,
        "maxLength": 120,
        "pattern": "^[a-zA-Z\\s'-]+$",
      },
      "context": "Used for personalization and official documentation",
    },
    {
      "order": 2,
      "id": "phone",
      "type": "text",
      "required": true,
      "presentation": "inline",
      "placeholder": "+91XXXXXXXXXX",
      "validation": {
        "pattern": "^\\+?[0-9]{7,15}$",
      },
      "context": "For installation coordination and updates",
    },
    {
      "order": 3,
      "id": "number_of_solar_panels",
      "type": "text",
      "required": true,
      "presentation": "inline",
      "placeholder": "1, 2, 3, 4, 5, 6, 7, 8, 9, 10",
      "context": "For installation coordination and updates",
    },
    {
      "order": 4,
      "id": "email",
      "type": "text",
      "required": true,
      "presentation": "inline",
      "placeholder": "you@example.com",
      "validation": {
        "pattern": "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
      },
      "context": "For quotes, documentation, and conversation resumption",
    },
    {
      "order": 5,
      "id": "address",
      "type": "form",
      "presentation": "form_group",
      "required": true,
      "placeholder": "e.g., 123 Street, Bangalore, 560001",
      "children": [
        {
          "id": "address_line",
          "type": "text",
          "placeholder": "Street, city",
          "required": true,
          "validation": {
            "minLength": 3,
            "maxLength": 500
          },
        },
        {
          "id": "pin_code",
          "type": "text",
          "placeholder": "560001",
          "required": true,
          "validation": {
            "pattern": "^[0-9]{5,7}$",
          },
        },
        {
          "id": "city",
          "type": "text",
          "placeholder": "Bangalore",
          "required": true,
          "validation": {
            "pattern": "^[a-zA-Z\\s'-]+$",
          },
        },
        {
          "id": "address_country",
          "type": "text",
          "placeholder": "India",
          "required": false,
          "validation": {
            "pattern": "^[a-zA-Z\\s'-]+$"
          },
        }
      ],
      "context": "Required for site assessment and installation planning",
    },
    {
      "order": 6,
      "id": "nets_interest",
      "type": "choice",
      "presentation": "buttons",
      "required": true,
      "placeholder": "Yes or No",
      "options": [
        { "value": "yes", "label": "Yes, I'm interested", "description": "Protects against birds, debris, and weather" },
        { "value": "no", "label": "No, not needed", "description": "Standard installation without nets" }
      ],
      "context": "Helps us prepare accurate quote with optional add-ons",
    },
    {
      "order": 7,
      "id": "attachments",
      "type": "files",
      "presentation": "upload_group",
      "required": false,
      "placeholder": "Upload photos of your site, roof, and angles",
      "context": "Optional but highly recommended for precise quotes",
      "children": [
        {
          "id": "site_photos",
          "type": "upload",
          "required": false,
          "accept": ["image/*"],
          "maxFiles": 3,
          "maxSize": "10MB",
        },
        {
          "id": "roof_photos",
          "type": "upload",
          "required": false,
          "accept": ["image/*"],
          "maxFiles": 3,
          "maxSize": "10MB",
        },
        {
          "id": "angle_photos",
          "type": "upload",
          "required": false,
          "accept": ["image/*"],
          "maxFiles": 3,
          "maxSize": "10MB",
        }
      ],
    },
    {
      "order": 8,
      "id": "panel_photo",
      "type": "file",
      "presentation": "upload",
      "required": false,
      "placeholder": "Upload a photo of your solar panel",
      "accept": ["image/*"],
      "maxFiles": 1,
      "maxSize": "10MB",
      "context": "Optional but highly recommended for precise quotes",
    }
  ],

  "completion": {
    "message": "Thank you {name}! I've collected all the necessary information. Our team will review your details and reach out within 24 hours with a customized solar solution.",
    "actions": [
      "create_customer_record",
      "send_confirmation_email",
      "notify_sales_team",
      "close_conversation"
    ],
    "uiHint": { "presentation": "show_summary" }
  }
};