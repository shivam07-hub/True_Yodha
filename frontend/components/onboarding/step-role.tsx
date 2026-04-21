"use client"

import { useState, useRef } from "react"

const MAX_ROLES = 3

const L2_CLUSTERS = [
  "Account Management","Accounting and Finance Software","Accounts Payable and Receivable",
  "Administrative Support and Clerical Tasks","Advertising","Aerospace Engineering",
  "Agile Software Development","Agricultural Management and Operations",
  "Agricultural Research and Agronomy","Agriculture and Crop Farming","Air Quality and Emissions",
  "Air Transportation","Alternative Therapy","Anesthesiology","Animal Care",
  "Animal Health and Veterinary Medicine","Animation and Game Design",
  "Appliance Repair and Maintenance","Application Programming Interface (API)","Aquaculture",
  "Architectural Design","Art and Illustration","Artificial Intelligence and Machine Learning (AI/ML)",
  "Audio Production and Technology","Auditing","Augmented and Virtual Reality (AR/VR)",
  "Automation Engineering","Automotive Technologies","Backup Software","Banking Services",
  "Basic Electrical Systems","Basic Technical Knowledge","Beauty and Body Treatments and Alterations",
  "Billing and Invoicing","Bioinformatics","Biology","Biotechnology","Blockchain",
  "Blood Collection","Brand Management","Budget Management","Business Analysis",
  "Business Communications","Business Consulting","Business Continuity","Business Intelligence",
  "Business Intelligence Software","Business Leadership","Business Management",
  "Business Operations","Business Solutions","Business Strategy","Business-to-Business (B2B) Sales",
  "C and C++","Cannabis","Cardiology","Carpentry","Cash Management","Cash Register Operation",
  "Chemical and Biomedical Engineering","Chemistry","Child Care",
  "Childhood Education and Development","Circuitry","Civil and Architectural Engineering",
  "Clean Energy","Cleaning and Janitorial Services","Client Support","Climate Change",
  "Clinical Informatics","Clinical Trials","Cloud Computing","Cloud Solutions",
  "Coaching and Athletic Training","Collaborative Software","Commercial Lending","Communication",
  "Community and Social Work","Company, Product, and Service Knowledge",
  "Compensation and Benefits","Computer Hardware","Computer Science",
  "Computer-Aided Manufacturing","Concrete and Masonry","Configuration Management",
  "Conservation","Construction Estimating","Construction Inspection","Construction Management",
  "Construction Painting","Content Development and Management","Content Management Systems",
  "Contract Management","Cost Accounting","Counseling Services","Creative Design",
  "Criminal Investigation and Forensics","Critical Thinking and Problem Solving",
  "Cryptocurrency","Customer Relationship Management (CRM)","Customer Service","Cybersecurity",
  "Dance","Data Analysis","Data Collection","Data Management","Data Science","Data Storage",
  "Data Visualization","Database Architecture and Administration","Databases","Dermatology",
  "Dictation","Digital Design","Digital Marketing","Disaster Management",
  "Distributed Computing","Document Management","Drafting and Engineering Design","E-Commerce",
  "Ear, Nose, and Throat","Earth and Space Science","Ecology","Economics",
  "Education Administration","Education Software and Technology",
  "Electrical and Computer Engineering","Electrical Construction","Electrical Power",
  "Electromechanical Engineering","Electronic Hardware","Electronic Trading",
  "Electronics Engineering","Electronics Manufacturing","Elements, Compounds, and Materials",
  "Emergency and Intensive Care","Emergency Services","Employee Relations","Employee Training",
  "Endocrinology","Energy Efficiency","Energy Management","Engineering Practices",
  "Engineering Software","Engineering, Other","Engineering, Scientific, and Technical Instruments",
  "Enterprise Application Management","Enterprise Information Management",
  "Environment and Resource Management","Environmental Engineering and Restoration",
  "Environmental Geology","Environmental Regulations","Equipment Repair and Maintenance",
  "Events and Conferences","Extensible Languages and XML",
  "Extraction, Transformation, and Loading (ETL)","Eye Care","Facility Management and Maintenance",
  "Financial Accounting","Financial Advisement","Financial Analysis","Financial Management",
  "Financial Modeling","Financial Regulation","Financial Reporting","Financial Trading",
  "Fire Prevention, Safety, and Control","Firmware","First Aid","Food and Beverage",
  "Food Science and Processing","Forestry","Fundraising and Crowdsourcing",
  "Funeral and Mortuary Services","Gastroenterology","General Accounting",
  "General Construction and Construction Labor","General Finance","General Lending",
  "General Medical Tests and Procedures","General Medicine","General Networking",
  "General Repairs and Maintenance","General Sales Practices","General Science and Research",
  "General Shipping and Receiving","Genetic Disorders","Genetics","Geological Engineering",
  "Geospatial Information and Technology","Geriatrics","Government Assistance",
  "Graphic and Visual Design","Graphic and Visual Design Software","Green Architecture",
  "Ground Freight Transportation","Ground Passenger Transportation",
  "Groundskeeping and Yard Care","Hand Tools","Hardware Description Languages (HDL)",
  "Hazardous Materials Management","Health Care Administration",
  "Health Care Procedure and Regulation","Health Information Management and Medical Records",
  "Heavy Equipment Operation","Hematology","Hepatology","Higher Education",
  "Home Health Care and Assisted Living","Hospitality Services","Hotels and Accommodations",
  "Human Resources Management and Planning","Human Resources Software","HVAC",
  "Identity and Access Management","Image Analysis","Immunology","Industrial Design",
  "Industrial Engineering","Industry Specific Marketing","Infectious Diseases",
  "Initiative and Leadership","Injury Treatment","Instructional and Curriculum Design",
  "Insulation","Insurance","Insurance and Warranty Claims Processing",
  "Integrated Development Environments (IDEs)","Intelligence Collection and Analysis",
  "Interior Design","Internal Controls","Internet of Things (IoT)",
  "Inventory and Warehousing","Investment Management","iOS Development","IT Automation",
  "IT Management","Java","JavaScript and jQuery","Journalism","Labor Compliance",
  "Laboratory Research","Landscaping and Horticulture","Language Competency",
  "Language Interpretation, Translation, and Studies","Law Enforcement and Criminal Justice",
  "Lean Manufacturing","Legal Proceedings","Legal Support","Library and Archiving",
  "Literature and Literary Studies","Litigation and Civil Justice","Livestock Farming",
  "Log Management","Logistics","Machinery","Mainframe Technologies","Malware Protection",
  "Manufacturing Design","Manufacturing Processes","Manufacturing Standards",
  "Marine and Naval Engineering","Market Analysis","Marketing Software",
  "Marketing Strategy and Techniques","Material Handling","Materials Science and Engineering",
  "Mathematical Software","Mathematics and Mathematical Modeling","Mechanical Engineering",
  "Media Production","Medical Billing and Coding","Medical Equipment and Technology",
  "Medical Imaging","Medical Science and Research","Medical Support",
  "Mental and Behavioral Health Specialties","Mental Health Diseases and Disorders",
  "Mental Health Therapies","Merchandising","Mergers and Acquisitions","Metal Fabrication",
  "Micro Manufacturing","Microsoft Development Tools","Microsoft Windows","Middleware",
  "Military Operations","Military Technology and Weapons","Mining Engineering",
  "Mobile Development","Mobility Assistance","Molecular, Cellular, and Microbiology",
  "Mortgage Lending","Music","Natural Gas","Natural Language Processing (NLP)","Nephrology",
  "Network Protocols","Network Security","Networking Hardware","Networking Software",
  "Neurology","Neuroscience","Nuclear Energy","Nuclear Medicine","Nursing and Patient Care",
  "Nutrition and Diet","Obstetrics and Gynecology (OBGYN)","Occupational Health and Safety",
  "Office and Productivity Equipment and Technology","Office Management","Oil and Gas",
  "Oncology","Online Advertising","Operating Systems","Optical Engineering",
  "Oral and Dental Care","Orthopedics","Other Programming Languages","Pathology",
  "Patient Education and Support","Payment Processing and Collection","Payroll","Pediatrics",
  "People Management","Performance Management","Personal Attributes",
  "Pharmacology and Drug Discovery","Pharmacy","Photo/Video Production and Technology",
  "Physical Abilities","Physical Therapy","Physics","Plant Operations and Management",
  "Plumbing","Poison Control","Policy Analysis, Research, and Development","Power Generation",
  "Power Tools","Presentation Design","Pricing Analysis","Process Engineering",
  "Process Improvement and Optimization","Procurement","Product Development",
  "Product Inspection","Product Management","Production and Assembly","Program Management",
  "Project Management","Promotions and Campaigns","Property Law","Property Management",
  "Prospecting and Qualification","Public Health and Disease Prevention","Public Relations",
  "Pulmonology","Quality Assurance and Control","Query Languages","Radio Frequency (RF)",
  "Rail Transportation","Real Estate Development","Real Estate Sales","Recruitment",
  "Regulation and Legal Compliance","Rehabilitation","Religious Studies and Services",
  "Retail Sales","Risk Management","Road and Bridge Construction","Roads and Drainage",
  "Robotics","Roofing","Safety and Security","Safety and Surveillance Technology",
  "Sales Analysis","Sales Management","Scheduling","Science Software","Scripting",
  "Scripting Languages","Sea and Waterway Transportation","Search Engines","Servers",
  "Signal Processing","Simulation and Simulation Software","Social Media","Social Skills",
  "Social Studies","Software Development","Software Development Tools",
  "Software Quality Assurance","Solar Energy","Solution Sales Engineering","Special Education",
  "Specialized Accounting","Specialized Sales","Speech Language Pathology",
  "Sports and Recreation","Statistical Software","Statistics","Streaming Media Systems",
  "Structured Finance","Student Support and Services","Supplier Management",
  "Supply Chain Management","Surgery","Surveying and Cartography",
  "System Design and Implementation","Systems Administration","Tax","Teaching",
  "Technical Support and Services","Telecommunications",
  "Telecommunications Equipment and Installation","Test Automation","Textiles",
  "Theatre and Performance Art","Training Programs","Transportation Equipment Manufacturing",
  "Transportation Operations","Transportation Security","Travel and Tourism","Underwriting",
  "Urban and Regional Planning","Urology","User Interface and User Experience (UI/UX) Design",
  "Vehicle Repair and Maintenance","Version Control","Video and Web Conferencing",
  "Virtualization and Virtual Machines","Waste Management","Water Energy",
  "Water Supply, Testing, and Treatment","Web Analytics and SEO","Web Content",
  "Web Design and Development","Web Services","Welding, Brazing, and Soldering",
  "Wind Energy","Wireless Technologies","Writing and Editing",
]

interface Props {
  onNext: (roles: string[], location: string) => void
  loading: boolean
}

export function StepRole({ onNext, loading }: Props) {
  const [roles, setRoles] = useState<string[]>([])
  const [input, setInput] = useState("")
  const [location, setLocation] = useState("")
  const [showDropdown, setShowDropdown] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  const [locFocused, setLocFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const atMax = roles.length >= MAX_ROLES
  const canSubmit = roles.length > 0 && location.trim().length > 0 && !loading

  const suggestions = input.trim().length === 0 ? [] : L2_CLUSTERS.filter(
    (c) => c.toLowerCase().includes(input.toLowerCase()) &&
    !roles.map((r) => r.toLowerCase()).includes(c.toLowerCase())
  ).slice(0, 8)

  function selectCluster(cluster: string) {
    if (roles.length >= MAX_ROLES) return
    setRoles((r) => [...r, cluster])
    setInput("")
    setShowDropdown(false)
    inputRef.current?.focus()
  }

  function removeRole(i: number) {
    setRoles((r) => r.filter((_, idx) => idx !== i))
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault()
      if (suggestions.length > 0) selectCluster(suggestions[0])
    }
    if (e.key === "Escape") setShowDropdown(false)
  }

  function handleBlur() {
    closeTimer.current = setTimeout(() => setShowDropdown(false), 150)
  }

  function handleDropdownMouseDown() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    onNext(roles, location.trim())
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32, width: "100%", maxWidth: 460 }}>

      {/* Header */}
      <div style={{ textAlign: "center" }}>
        <div style={{
          display: "inline-block",
          fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase",
          color: "var(--tm-accent)", marginBottom: 12,
          padding: "3px 10px", borderRadius: 999,
          background: "var(--tm-accent-wash)",
          border: "1px solid var(--tm-accent-ring)",
        }}>
          Step 2 of 3
        </div>
        <h2 style={{
          fontSize: "var(--tm-fs-title)", fontWeight: 700,
          color: "var(--tm-text)", marginBottom: 8, lineHeight: 1.2,
        }}>
          What roles are you targeting?
        </h2>
        <p style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-muted)", lineHeight: 1.6 }}>
          Search and pick up to {MAX_ROLES} skill areas. We&apos;ll match your gaps against live job postings for each.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Role search */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <label style={{ fontSize: "var(--tm-fs-meta)", fontWeight: 600, color: "var(--tm-text-muted)" }}>
              Target skill area
            </label>
            <span style={{
              fontSize: 11, color: atMax ? "var(--tm-warning)" : "var(--tm-text-faint)",
              fontVariantNumeric: "tabular-nums",
            }}>
              {roles.length} / {MAX_ROLES}
            </span>
          </div>

          {/* Input + dropdown wrapper */}
          <div style={{ position: "relative" }}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => { setInput(e.target.value); setShowDropdown(true) }}
              onKeyDown={handleKeyDown}
              onFocus={() => { setInputFocused(true); setShowDropdown(true) }}
              onBlur={() => { setInputFocused(false); handleBlur() }}
              placeholder={atMax ? "Max 3 selected" : "Search skill areas…"}
              disabled={atMax}
              autoComplete="off"
              style={{
                width: "100%",
                padding: "11px 14px",
                borderRadius: "var(--tm-radius-sm)",
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${inputFocused ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
                color: "var(--tm-text)",
                fontSize: "var(--tm-fs-meta)",
                fontFamily: "inherit",
                outline: "none",
                opacity: atMax ? 0.4 : 1,
                transition: "border-color var(--tm-dur) var(--tm-ease)",
                boxSizing: "border-box",
              }}
            />

            {/* Dropdown */}
            {showDropdown && suggestions.length > 0 && (
              <div
                onMouseDown={handleDropdownMouseDown}
                style={{
                  position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                  background: "var(--tm-surface, #0d0d12)",
                  border: "1px solid var(--tm-accent-ring)",
                  borderRadius: "var(--tm-radius-sm)",
                  overflow: "hidden",
                  zIndex: 50,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                  maxHeight: 272,
                  overflowY: "auto",
                }}
              >
                {suggestions.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => selectCluster(c)}
                    style={{
                      display: "block", width: "100%", textAlign: "left",
                      padding: "10px 14px",
                      background: "transparent",
                      border: "none",
                      borderBottom: "1px solid var(--tm-border-soft)",
                      color: "var(--tm-text-muted)",
                      fontSize: 13, fontFamily: "inherit",
                      cursor: "pointer",
                      transition: "background var(--tm-dur)",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--tm-accent-wash)"; e.currentTarget.style.color = "var(--tm-accent)" }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--tm-text-muted)" }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected tags */}
          {roles.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
              {roles.map((role, i) => (
                <div key={i} style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "5px 8px 5px 12px",
                  borderRadius: 999,
                  background: "var(--tm-accent-wash)",
                  border: "1px solid var(--tm-accent-ring)",
                  fontSize: 13, color: "var(--tm-accent)",
                  animation: "tagIn 180ms var(--tm-ease) both",
                }}>
                  <span style={{ fontWeight: 500 }}>{role}</span>
                  <button
                    type="button"
                    onClick={() => removeRole(i)}
                    aria-label={`Remove ${role}`}
                    style={{
                      width: 16, height: 16, borderRadius: "50%",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: "rgba(0,245,212,0.15)", border: "none", padding: 0,
                      cursor: "pointer", color: "var(--tm-accent)",
                      fontSize: 12, lineHeight: 1,
                      transition: "background var(--tm-dur)",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,245,212,0.3)" }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(0,245,212,0.15)" }}
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Location */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ fontSize: "var(--tm-fs-meta)", fontWeight: 600, color: "var(--tm-text-muted)" }}>
            Location
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onFocus={() => setLocFocused(true)}
            onBlur={() => setLocFocused(false)}
            placeholder="e.g. Mumbai, India"
            style={{
              padding: "11px 14px",
              borderRadius: "var(--tm-radius-sm)",
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${locFocused ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
              color: "var(--tm-text)",
              fontSize: "var(--tm-fs-meta)",
              fontFamily: "inherit",
              outline: "none",
              transition: "border-color var(--tm-dur) var(--tm-ease)",
            }}
          />
        </div>

        {roles.length > 0 && (
          <p style={{ fontSize: 12, color: "var(--tm-text-faint)", lineHeight: 1.6, marginTop: -8 }}>
            Gap analysis will use live job postings for{" "}
            <span style={{ color: "var(--tm-accent)" }}>{roles.join(", ")}</span>
            {" "}to find what skills you need to close.
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            marginTop: 4, padding: "14px",
            borderRadius: "var(--tm-radius-sm)",
            background: canSubmit ? "var(--tm-accent)" : "rgba(255,255,255,0.05)",
            border: `1px solid ${canSubmit ? "var(--tm-accent)" : "var(--tm-border-soft)"}`,
            color: canSubmit ? "var(--tm-bg)" : "var(--tm-text-faint)",
            fontSize: "var(--tm-fs-meta)", fontWeight: 700,
            cursor: canSubmit ? "pointer" : "default",
            fontFamily: "inherit",
            transition: "all var(--tm-dur) var(--tm-ease)",
            letterSpacing: "0.02em",
          }}
        >
          {loading ? "Analysing your CV…" : "Get my Mirror Score →"}
        </button>
      </form>

      <style>{`
        @keyframes tagIn {
          from { opacity: 0; transform: scale(0.85) translateY(4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}
