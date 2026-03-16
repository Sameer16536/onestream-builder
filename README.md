# OneStream Metadata Builder

A fast, fully client-side web application designed to help non-technical users build OneStreamXF metadata hierarchies from raw Excel or CSV data. 

This tool eliminates the need for complex VBA macros or manual XML crafting by providing an intuitive, wizard-like interface to map, configure, and generate complete OneStream XML dimension files securely in the browser.

## Features

- **100% Client-Side Processing**: No data is sent to a server. All Excel parsing and XML generation happens locally in your browser, ensuring complete data privacy and security.
- **Drag & Drop Upload**: Supports `.xlsx`, `.xls`, and `.csv` files up to 50MB.
- **Visual Column Mapping**: Easily map your spreadsheet columns to OneStream hierarchy levels without needing to format the source file perfectly.
- **Custom Hierarchy Ordering**: Define exactly how your columns roll up (e.g., mapping L1 -> L2 -> L3 or reversing it to L3 -> L2 -> L1).
- **Dimension-Specific Properties**:
  - **Entity**: Automatically configures `Currency`, `IsIC`, `FlowConstraint`, and relationship properties like `% Consolidation` and `% Ownership`.
  - **Account**: Configures `AllowInput`, `IsICAccount`, `IsConsolidated`, and `Aggregation Weight`.
  - **UD1–UD8**: Configures standard User Defined properties like `IsAttributeMember`, `AlternateCurrency`, etc.
- **Intelligent Collision Handling**:
  - **Collapse Duplicates**: Automatically skips duplicate names appearing in consecutive levels (e.g., `America -> North_America -> North_America` becomes `America -> North_America`).
  - **Rename with Level Suffix**: If the same member name appears across different branches or levels, it automatically suffixes them to prevent OneStream import errors (e.g., `Sales_L2`, `Sales_L3`).
- **Data Quality Reporting**: Generates a pre-import report detailing skipped rows, truncated names (respecting OneStream's character limits), and structural warnings.
- **Single-File Export**: The app can be built into a single, portable `index.html` file that can be distributed easily within an organization.

## How It Works

1. **Upload**: Drop your hierarchy extract.
2. **Levels**: Specify the maximum depth of your hierarchy.
3. **Map Columns**: Link your spreadsheet columns to the respective levels.
4. **Order**: Define the parent-child relationship order.
5. **Properties**: Select the Dimension Type (Entity, Account, or UD) and assign default properties to all members.
6. **Config**: Set the Root Member, Dimension Name, and Inherited Dimension.
7. **Generate**: Get a fully formatted, ready-to-import `<OneStreamXF>` XML file.

## Tech Stack

- **React 18**
- **Vite**
- **XLSX (SheetJS)** for lightning-fast client-side Excel parsing.
- **Vite SingleFile Plugin** for portable builds.

## Development

### Setup

```bash
# Install dependencies
npm install

# Start the local development server
npm run dev
```

### Building for Production

To create a production build, run:

```bash
npm run build
```

Thanks to `vite-plugin-singlefile`, this will generate a single `dist/index.html` file containing all the HTML, CSS, and JS required to run the application offline or hosted on any basic static file server.

## License
MIT
