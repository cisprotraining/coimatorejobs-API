// seeds/categories.seed.js
import mongoose from 'mongoose';
import Industry from '../models/industry.model.js';
import FunctionalArea from '../models/functionalArea.model.js';
import Role from '../models/role.model.js';
import Location from '../models/location.model.js';
import Skill from '../models/skill.model.js';
import dotenv from 'dotenv';
import connectToDatabase from '../database/mongodb.js';

dotenv.config();
await connectToDatabase();

const generateSlug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const industriesData = [
  { name: 'Aviation & Aerospace', keywords: ['aviation jobs', 'aerospace engineering jobs', 'pilot jobs', 'aircraft maintenance jobs', 'airline careers'] },
  { name: 'Banking / Insurance / Financial Services', keywords: ['banking jobs', 'insurance jobs', 'financial services careers', 'BFSI jobs', 'bank PO jobs', 'insurance agent vacancies'] },
  { name: 'Beauty, Fitness & Personal Care', keywords: ['beauty jobs', 'fitness trainer jobs', 'salon jobs', 'spa careers', 'personal trainer openings', 'wellness jobs'] },
  { name: 'Construction', keywords: ['construction jobs', 'civil engineering jobs', 'site engineer vacancies', 'project manager construction', 'building construction careers'] },
  { name: 'Consulting', keywords: ['consulting jobs', 'management consulting careers', 'business consultant vacancies', 'strategy consulting openings', 'IT consulting jobs'] },
  { name: 'Energy & Mining', keywords: ['energy jobs', 'oil and gas jobs', 'mining engineer vacancies', 'power sector careers', 'renewable energy jobs'] },
  { name: 'Healthcare & Life Sciences', keywords: ['healthcare jobs', 'doctor jobs', 'nurse vacancies', 'hospital staff openings', 'pharma jobs', 'medical jobs', 'life sciences careers'] },
  { name: 'Hospitality', keywords: ['hospitality jobs', 'hotel jobs', 'restaurant careers', 'tourism vacancies', 'chef jobs', 'front office openings'] },
  { name: 'IT / Software', keywords: ['IT jobs', 'software jobs', 'developer vacancies', 'IT careers in India', 'tech jobs', 'software engineer openings', 'programming jobs'] },
  { name: 'Logistics / Transportation', keywords: ['logistics jobs', 'transportation jobs', 'supply chain careers', 'warehouse jobs', 'driver vacancies', 'freight forwarding openings'] },
  { name: 'Manufacturing', keywords: ['manufacturing jobs', 'production jobs', 'factory vacancies', 'manufacturing engineer careers', 'assembly line openings'] },
  { name: 'Media / Entertainment', keywords: ['media jobs', 'entertainment careers', 'journalism vacancies', 'film jobs', 'content creator openings', 'TV radio jobs'] },
  { name: 'Pharmaceuticals', keywords: ['pharma jobs', 'pharmaceutical careers', 'medical representative vacancies', 'drug inspector openings', 'pharmacist jobs'] },
  { name: 'Retail & eCommerce', keywords: ['retail jobs', 'ecommerce jobs', 'store manager vacancies', 'online sales careers', 'merchandising openings'] },
  { name: 'Telecommunications', keywords: ['telecom jobs', 'network engineer vacancies', 'telecommunications careers', 'BSS OSS jobs', 'mobile network openings'] },
  { name: 'Textile & Garments', keywords: ['textile jobs', 'garment industry vacancies', 'fashion designer careers', 'apparel manufacturing openings', 'textile engineer jobs'] },
  { name: 'Other', keywords: ['miscellaneous jobs', 'general vacancies', 'other sector careers', 'diverse job openings'] },
];

const functionalAreasData = [
  { name: 'Admin / Back Office / Computer Operator', keywords: ['admin jobs', 'back office vacancies', 'computer operator careers', 'data entry jobs', 'office assistant openings'] },
  { name: 'Advertising / Communication', keywords: ['advertising jobs', 'communication careers', 'public relations vacancies', 'media planning openings', 'brand communication jobs'] },
  { name: 'Administration & Facilities', keywords: ['administration jobs', 'facility management vacancies', 'admin manager careers', 'office administration openings'] },
  { name: 'BFSI, Investments & Trading', keywords: ['BFSI jobs', 'investment banking vacancies', 'trading jobs', 'financial analyst careers', 'stock market openings'] },
  { name: 'Civil Engineering', keywords: ['civil engineer jobs', 'civil engineering vacancies', 'site engineer careers', 'structural engineer openings'] },
  { name: 'Content, Editorial & Journalism', keywords: ['content writing jobs', 'editorial vacancies', 'journalism careers', 'copywriter openings', 'content creator jobs'] },
  { name: 'CSR & Social Service', keywords: ['CSR jobs', 'social service vacancies', 'NGO careers', 'community development openings'] },
  { name: 'Customer Success, Service & Operations', keywords: ['customer service jobs', 'customer success careers', 'operations vacancies', 'BPO jobs', 'call center openings'] },
  { name: 'Customer Support', keywords: ['customer support jobs', 'helpdesk vacancies', 'technical support careers', 'chat support openings'] },
  { name: 'Clinical & Medical', keywords: ['clinical jobs', 'medical staff vacancies', 'doctor nurse jobs'] },
  { name: 'Data Science & Analytics', keywords: ['data science jobs', 'data analyst vacancies', 'analytics careers', 'machine learning openings', 'big data jobs'] },
  { name: 'Delivery / Driver / Logistics', keywords: ['delivery jobs', 'driver vacancies', 'logistics driver careers', 'transport driver openings'] },
  { name: 'Domestic Worker', keywords: ['domestic helper jobs', 'housekeeping vacancies', 'maid careers', 'caretaker openings'] },
  { name: 'Education & Training', keywords: ['teaching jobs', 'education careers', 'trainer vacancies', 'lecturer openings', 'school teacher jobs'] },
  { name: 'Engineering - Hardware & Networks', keywords: ['hardware engineer jobs', 'network engineer vacancies', 'IT infrastructure careers', 'system administrator openings'] },
  { name: 'Engineering - Software & QA', keywords: ['software engineer jobs', 'QA tester vacancies', 'software testing careers', 'devops openings'] },
  { name: 'Environment Health & Safety', keywords: ['EHS jobs', 'safety officer vacancies', 'environmental engineer careers', 'health safety openings'] },
  { name: 'Facility Management', keywords: ['facility manager jobs', 'maintenance vacancies', 'property management careers'] },
  { name: 'Finance & Accounting', keywords: ['finance jobs', 'accounting vacancies', 'CA jobs', 'accountant careers', 'financial analyst openings'] },
  { name: 'Food, Beverage & Hospitality', keywords: ['food industry jobs', 'beverage careers', 'hospitality vacancies', 'F&B manager openings'] },
  { name: 'HR & Admin', keywords: ['HR jobs', 'human resources vacancies', 'recruiter careers', 'admin HR openings'] },
  { name: 'Healthcare Support', keywords: ['healthcare support jobs', 'hospital support vacancies'] },
  { name: 'Human Resources', keywords: ['human resources jobs', 'HR manager vacancies', 'talent acquisition careers', 'payroll openings'] },
  { name: 'IT & Information Security', keywords: ['cyber security jobs', 'information security vacancies', 'IT security careers', 'ethical hacker openings'] },
  { name: 'Legal & Regulatory', keywords: ['legal jobs', 'lawyer vacancies', 'compliance careers', 'corporate lawyer openings'] },
  { name: 'Maintenance Services', keywords: ['maintenance jobs', 'technician vacancies', 'service engineer careers'] },
  { name: 'Marketing & Communication', keywords: ['marketing jobs', 'digital marketing vacancies', 'brand manager careers', 'SEO jobs'] },
  { name: 'Mechanical Engineering', keywords: ['mechanical engineer jobs', 'mechanical engineering vacancies', 'design engineer careers'] },
  { name: 'Media Production & Entertainment', keywords: ['media production jobs', 'video editor vacancies', 'film production careers'] },
  { name: 'Merchandising, Retail & eCommerce', keywords: ['merchandising jobs', 'retail manager vacancies', 'ecommerce careers'] },
  { name: 'Operations', keywords: ['operations jobs', 'operations manager vacancies', 'process improvement careers'] },
  { name: 'Product Management', keywords: ['product manager jobs', 'product management vacancies', 'product owner careers'] },
  { name: 'Production, Manufacturing & Engineering', keywords: ['production jobs', 'manufacturing engineer vacancies', 'industrial engineering careers'] },
  { name: 'Procurement & Supply Chain', keywords: ['procurement jobs', 'supply chain vacancies', 'logistics manager careers', 'purchase openings'] },
  { name: 'Project & Program Management', keywords: ['project manager jobs', 'program management vacancies', 'PMP careers'] },
  { name: 'Quality Assurance', keywords: ['quality assurance jobs', 'QA QC vacancies', 'quality control careers'] },
  { name: 'Research & Development', keywords: ['R&D jobs', 'research scientist vacancies', 'development engineer careers'] },
  { name: 'Restaurant / Hospitality / Tourism', keywords: ['restaurant jobs', 'tourism vacancies', 'travel agent careers'] },
  { name: 'Risk Management & Compliance', keywords: ['risk management jobs', 'compliance officer vacancies', 'audit careers'] },
  { name: 'Sales & Business Development', keywords: ['sales jobs', 'business development vacancies', 'BDM careers', 'field sales openings'] },
  { name: 'Security Services', keywords: ['security jobs', 'security guard vacancies', 'corporate security careers'] },
  { name: 'Shipping & Maritime', keywords: ['shipping jobs', 'maritime careers', 'port operations vacancies'] },
  { name: 'Software Engineering', keywords: ['software engineering jobs', 'full stack developer vacancies', 'backend engineer careers'] },
  { name: 'Strategic & Top Management', keywords: ['management jobs', 'CEO vacancies', 'strategy roles', 'top management careers'] },
  { name: 'Tailoring, Apparel & Home Furnishing', keywords: ['tailoring jobs', 'apparel designer vacancies', 'fashion careers'] },
  { name: 'Teaching & Training', keywords: ['teaching jobs', 'trainer vacancies', 'corporate training careers'] },
  { name: 'UX, Design & Architecture', keywords: ['UX design jobs', 'graphic designer vacancies', 'UI UX careers', 'architect openings'] },
];

const rolesData = [
  // IT / Software related
  { name: 'Software Developer', functionalAreaName: 'Engineering - Software & QA', keywords: ['software developer jobs', 'coder vacancies', 'software engineer openings'] },
  { name: 'Data Scientist', functionalAreaName: 'Data Science & Analytics', keywords: ['data scientist jobs', 'ml engineer vacancies', 'data science careers'] },
  { name: 'Frontend Developer', functionalAreaName: 'Engineering - Software & QA', keywords: ['frontend developer jobs', 'react js vacancies', 'angular developer openings'] },
  { name: 'Backend Developer', functionalAreaName: 'Engineering - Software & QA', keywords: ['backend developer jobs', 'node js vacancies', 'java developer openings'] },
  { name: 'Full Stack Developer', functionalAreaName: 'Engineering - Software & QA', keywords: ['full stack developer jobs', 'mern stack vacancies', 'mean stack openings'] },
  { name: 'QA Tester', functionalAreaName: 'Engineering - Software & QA', keywords: ['qa tester jobs', 'automation tester vacancies', 'manual tester openings'] },
  { name: 'DevOps Engineer', functionalAreaName: 'Engineering - Software & QA', keywords: ['devops engineer jobs', 'ci cd vacancies', 'cloud engineer openings'] },
  { name: 'Mobile App Developer', functionalAreaName: 'Engineering - Software & QA', keywords: ['android developer jobs', 'ios developer vacancies', 'flutter developer openings'] },
  { name: 'Cloud Engineer', functionalAreaName: 'Engineering - Hardware & Networks', keywords: ['cloud engineer jobs', 'aws azure vacancies', 'gcp openings'] },
  { name: 'Cyber Security Analyst', functionalAreaName: 'IT & Information Security', keywords: ['cyber security jobs', 'ethical hacker vacancies', 'security analyst openings'] },

  // Finance & Accounting
  { name: 'Accountant', functionalAreaName: 'Finance & Accounting', keywords: ['accountant jobs', 'chartered accountant vacancies', 'tally accountant openings'] },
  { name: 'Financial Analyst', functionalAreaName: 'Finance & Accounting', keywords: ['financial analyst jobs', 'finance analyst vacancies'] },
  { name: 'Auditor', functionalAreaName: 'Finance & Accounting', keywords: ['auditor jobs', 'internal auditor vacancies'] },
  { name: 'Tax Consultant', functionalAreaName: 'Finance & Accounting', keywords: ['tax consultant jobs', 'gst expert vacancies'] },
  { name: 'Investment Banker', functionalAreaName: 'BFSI, Investments & Trading', keywords: ['investment banker jobs', 'ib analyst vacancies'] },
  { name: 'Credit Analyst', functionalAreaName: 'BFSI, Investments & Trading', keywords: ['credit analyst jobs'] },

  // HR & Admin
  { name: 'HR Manager', functionalAreaName: 'HR & Admin', keywords: ['hr manager jobs', 'human resources manager vacancies'] },
  { name: 'Recruiter', functionalAreaName: 'Human Resources', keywords: ['recruiter jobs', 'talent acquisition vacancies', 'hr executive openings'] },
  { name: 'HR Executive', functionalAreaName: 'HR & Admin', keywords: ['hr executive jobs'] },
  { name: 'Payroll Specialist', functionalAreaName: 'HR & Admin', keywords: ['payroll jobs', 'compensation analyst vacancies'] },
  { name: 'Admin Executive', functionalAreaName: 'Admin / Back Office / Computer Operator', keywords: ['admin executive jobs', 'office admin vacancies'] },

  // Sales & Business Development
  { name: 'Sales Executive', functionalAreaName: 'Sales & Business Development', keywords: ['sales executive jobs', 'field sales vacancies'] },
  { name: 'Business Development Manager', functionalAreaName: 'Sales & Business Development', keywords: ['bdm jobs', 'business development vacancies'] },
  { name: 'Relationship Manager', functionalAreaName: 'Sales & Business Development', keywords: ['relationship manager jobs', 'client relationship vacancies'] },
  { name: 'Inside Sales Executive', functionalAreaName: 'Sales & Business Development', keywords: ['inside sales jobs'] },
  { name: 'Channel Sales Manager', functionalAreaName: 'Sales & Business Development', keywords: ['channel sales jobs'] },

  // Mechanical / Civil / Production Engineering
  { name: 'Mechanical Engineer', functionalAreaName: 'Mechanical Engineering', keywords: ['mechanical engineer jobs', 'design engineer vacancies'] },
  { name: 'Civil Engineer', functionalAreaName: 'Civil Engineering', keywords: ['civil engineer jobs', 'site civil engineer openings'] },
  { name: 'Site Engineer', functionalAreaName: 'Civil Engineering', keywords: ['site engineer jobs', 'construction site vacancies'] },
  { name: 'Production Engineer', functionalAreaName: 'Production, Manufacturing & Engineering', keywords: ['production engineer jobs'] },
  { name: 'Quality Engineer', functionalAreaName: 'Quality Assurance', keywords: ['quality engineer jobs', 'qa qc vacancies'] },

  // Education & Training
  { name: 'Teacher', functionalAreaName: 'Education & Training', keywords: ['teacher jobs', 'school teacher vacancies'] },
  { name: 'Lecturer', functionalAreaName: 'Teaching & Training', keywords: ['lecturer jobs', 'college lecturer openings'] },
  { name: 'Trainer', functionalAreaName: 'Teaching & Training', keywords: ['corporate trainer jobs', 'soft skills trainer vacancies'] },
  { name: 'Content Developer', functionalAreaName: 'Education & Training', keywords: ['content developer jobs'] },

  // Healthcare
  { name: 'Doctor', functionalAreaName: 'Clinical & Medical', keywords: ['doctor jobs', 'mbbs doctor vacancies', 'physician openings']},
  { name: 'Nurse', functionalAreaName: 'Clinical & Medical', keywords: ['nurse jobs', 'staff nurse vacancies'] },
  { name: 'Medical Representative', functionalAreaName: 'Healthcare Support', keywords: ['medical rep jobs'] },
  { name: 'Lab Technician', functionalAreaName: 'Healthcare Support', keywords: ['lab technician jobs'] },
  { name: 'Hospital Administrator', functionalAreaName: 'Healthcare Support', keywords: ['hospital admin jobs'] },
  { name: 'Physiotherapist',  functionalAreaName: 'Clinical & Medical', keywords: ['physiotherapist jobs'] },
 {  name: 'Radiology Technician', functionalAreaName: 'Healthcare Support', keywords: ['radiology technician jobs'] },

  // Hospitality / Tourism
  { name: 'Chef', functionalAreaName: 'Food, Beverage & Hospitality', keywords: ['chef jobs', 'hotel chef vacancies'] },
  { name: 'Hotel Manager', functionalAreaName: 'Restaurant / Hospitality / Tourism', keywords: ['hotel manager jobs', 'front office manager openings'] },
  { name: 'Tour Operator', functionalAreaName: 'Restaurant / Hospitality / Tourism', keywords: ['tour operator jobs'] },

  // Logistics / Supply Chain
  { name: 'Logistics Manager', functionalAreaName: 'Procurement & Supply Chain', keywords: ['logistics manager jobs', 'supply chain manager vacancies'] },
  { name: 'Supply Chain Analyst', functionalAreaName: 'Procurement & Supply Chain', keywords: ['supply chain analyst jobs'] },
  { name: 'Warehouse Manager', functionalAreaName: 'Procurement & Supply Chain', keywords: ['warehouse manager jobs'] },

  // Marketing & Digital
  { name: 'Digital Marketing Executive', functionalAreaName: 'Marketing & Communication', keywords: ['digital marketing jobs', 'seo specialist vacancies'] },
  { name: 'Content Writer', functionalAreaName: 'Content, Editorial & Journalism', keywords: ['content writer jobs', 'copywriter openings'] },
  { name: 'Marketing Manager', functionalAreaName: 'Marketing & Communication', keywords: ['marketing manager jobs'] },

  // Other high-demand (add more as needed)
  { name: 'Project Manager', functionalAreaName: 'Project & Program Management', keywords: ['project manager jobs', 'pmp vacancies'] },
  { name: 'Product Manager', functionalAreaName: 'Product Management', keywords: ['product manager jobs'] },
  { name: 'UI/UX Designer', functionalAreaName: 'UX, Design & Architecture', keywords: ['ui ux designer jobs'] },
  { name: 'Graphic Designer', functionalAreaName: 'UX, Design & Architecture', keywords: ['graphic designer jobs'] },
  
  // Operations & Admin
  { name: 'Operations Executive', functionalAreaName: 'Operations', keywords: ['operations executive jobs'] },
  { name: 'Operations Manager', functionalAreaName: 'Operations', keywords: ['operations manager jobs'] },
  { name: 'Office Assistant', functionalAreaName: 'Admin / Back Office / Computer Operator', keywords: ['office assistant jobs'] },
  { name: 'Back Office Executive', functionalAreaName: 'Admin / Back Office / Computer Operator', keywords: ['back office executive jobs'] },
  { name: 'Facility Supervisor', functionalAreaName: 'Facility Management', keywords: ['facility supervisor jobs'] },

  // Manufacturing & Production
  { name: 'CNC Operator', functionalAreaName: 'Production, Manufacturing & Engineering', keywords: ['cnc operator jobs'] },
  { name: 'Machine Operator', functionalAreaName: 'Production, Manufacturing & Engineering', keywords: ['machine operator jobs'] },
  { name: 'Assembly Line Worker', functionalAreaName: 'Production, Manufacturing & Engineering', keywords: ['assembly line jobs'] },
  { name: 'Maintenance Technician', functionalAreaName: 'Maintenance Services', keywords: ['maintenance technician jobs'] },
  { name: 'Electrical Technician', functionalAreaName: 'Maintenance Services', keywords: ['electrical technician jobs'] },

  // BFSI & Compliance
  { name: 'Relationship Officer', functionalAreaName: 'BFSI, Investments & Trading', keywords: ['relationship officer jobs'] },
  { name: 'Loan Processing Executive', functionalAreaName: 'BFSI, Investments & Trading', keywords: ['loan processing jobs'] },
  { name: 'Compliance Officer', functionalAreaName: 'Risk Management & Compliance', keywords: ['compliance officer jobs'] },
  { name: 'Risk Analyst', functionalAreaName: 'Risk Management & Compliance', keywords: ['risk analyst jobs'] },

  // Retail & Frontline
  { name: 'Store Manager', functionalAreaName: 'Merchandising, Retail & eCommerce', keywords: ['store manager jobs'] },
  { name: 'Cashier', functionalAreaName: 'Merchandising, Retail & eCommerce', keywords: ['cashier jobs'] },
  { name: 'Retail Sales Executive', functionalAreaName: 'Sales & Business Development', keywords: ['retail sales jobs'] },

  // Logistics
  { name: 'Delivery Executive', functionalAreaName: 'Delivery / Driver / Logistics', keywords: ['delivery executive jobs'] },
  { name: 'Fleet Supervisor', functionalAreaName: 'Procurement & Supply Chain', keywords: ['fleet supervisor jobs'] },
  { name: 'Transport Coordinator', functionalAreaName: 'Procurement & Supply Chain', keywords: ['transport coordinator jobs'] },

  // Healthcare Support
//   { name: 'Lab Technician', functionalAreaName: 'Healthcare & Life Sciences', keywords: ['lab technician jobs'] },
//   { name: 'Hospital Administrator', functionalAreaName: 'Healthcare & Life Sciences', keywords: ['hospital admin jobs'] },
//   { name: 'Physiotherapist', functionalAreaName: 'Healthcare & Life Sciences', keywords: ['physiotherapist jobs'] },
//   { name: 'Radiology Technician', functionalAreaName: 'Healthcare & Life Sciences', keywords: ['radiology technician jobs'] },


];

const locationsData = [
  { name: 'Coimbatore', state: 'Tamil Nadu', keywords: ['jobs in coimbatore'] },
  { name: 'Salem', state: 'Tamil Nadu', keywords: ['jobs in salem'] },
  { name: 'Erode', state: 'Tamil Nadu', keywords: ['jobs in erode'] },
  { name: 'Tiruppur', state: 'Tamil Nadu', keywords: ['jobs in tiruppur'] },
  { name: 'Chennai', state: 'Tamil Nadu', keywords: ['jobs in chennai'] },
  { name: 'Madurai', state: 'Tamil Nadu', keywords: ['jobs in madurai'] },
  { name: 'Tiruchirappalli', state: 'Tamil Nadu', keywords: ['jobs in trichy'] },
  { name: 'Hosur', state: 'Tamil Nadu', keywords: ['jobs in hosur'] },
  { name: 'Krishnagiri', state: 'Tamil Nadu', keywords: ['jobs in krishnagiri'] },
  { name: 'Dindigul', state: 'Tamil Nadu', keywords: ['jobs in dindigul'] },
  { name: 'Thoothukudi', state: 'Tamil Nadu', keywords: ['jobs in tuticorin'] },
  { name: 'Cuddalore', state: 'Tamil Nadu', keywords: ['jobs in cuddalore'] },
  { name: 'Kanchipuram', state: 'Tamil Nadu', keywords: ['jobs in kanchipuram'] },
  { name: 'Ranipet', state: 'Tamil Nadu', keywords: ['jobs in ranipet'] },
  { name: 'Vellore', state: 'Tamil Nadu', keywords: ['jobs in vellore'] },
  { name: 'Tirunelveli', state: 'Tamil Nadu', keywords: ['jobs in tirunelveli'] },
  { name: 'Nagercoil', state: 'Tamil Nadu', keywords: ['jobs in nagercoil'] },
  { name: 'Bengaluru', state: 'Karnataka', keywords: ['jobs in bengaluru', 'jobs in bangalore'] },
  { name: 'Mumbai', state: 'Maharashtra', keywords: ['jobs in mumbai'] },
  { name: 'Delhi', state: 'Delhi', keywords: ['jobs in delhi', 'jobs in new delhi'] },
  { name: 'Hyderabad', state: 'Telangana', keywords: ['jobs in hyderabad'] },
  { name: 'Pune', state: 'Maharashtra', keywords: ['jobs in pune'] },
  { name: 'Kolkata', state: 'West Bengal', keywords: ['jobs in kolkata'] },
  { name: 'Ahmedabad', state: 'Gujarat', keywords: ['jobs in ahmedabad'] },
  { name: 'Jaipur', state: 'Rajasthan', keywords: ['jobs in jaipur'] },
  { name: 'Lucknow', state: 'Uttar Pradesh', keywords: ['jobs in lucknow'] },
  { name: 'Chandigarh', state: 'Chandigarh', keywords: ['jobs in chandigarh'] },
  { name: 'Indore', state: 'Madhya Pradesh', keywords: ['jobs in indore'] },
  { name: 'Bhopal', state: 'Madhya Pradesh', keywords: ['jobs in bhopal'] },
  { name: 'Visakhapatnam', state: 'Andhra Pradesh', keywords: ['jobs in vizag'] },
  { name: 'Surat', state: 'Gujarat', keywords: ['jobs in surat'] },
  { name: 'Nagpur', state: 'Maharashtra', keywords: ['jobs in nagpur'] },
  { name: 'Kanpur', state: 'Uttar Pradesh', keywords: ['jobs in kanpur'] },
  { name: 'Patna', state: 'Bihar', keywords: ['jobs in patna'] },
  { name: 'Vadodara', state: 'Gujarat', keywords: ['jobs in vadodara'] },
  { name: 'Ludhiana', state: 'Punjab', keywords: ['jobs in ludhiana'] },
  { name: 'Agra', state: 'Uttar Pradesh', keywords: ['jobs in agra'] },
  { name: 'Nashik', state: 'Maharashtra', keywords: ['jobs in nashik'] },
  { name: 'Meerut', state: 'Uttar Pradesh', keywords: ['jobs in meerut'] },
  { name: 'Rajkot', state: 'Gujarat', keywords: ['jobs in rajkot'] },
  { name: 'Varanasi', state: 'Uttar Pradesh', keywords: ['jobs in varanasi'] },
  { name: 'Amritsar', state: 'Punjab', keywords: ['jobs in amritsar'] },
  { name: 'Allahabad', state: 'Uttar Pradesh', keywords: ['jobs in prayagraj'] },
  { name: 'Jodhpur', state: 'Rajasthan', keywords: ['jobs in jodhpur'] },
  { name: 'Vijayawada', state: 'Andhra Pradesh', keywords: ['jobs in vijayawada'] },
  { name: 'Kochi', state: 'Kerala', keywords: ['jobs in kochi'] },
  { name: 'Thiruvananthapuram', state: 'Kerala', keywords: ['jobs in trivandrum'] },
  { name: 'Guwahati', state: 'Assam', keywords: ['jobs in guwahati'] },
  { name: 'Other', keywords: ['jobs in other locations', 'jobs across india'] },
];

const skillsData = [
  { name: 'Java', keywords: ['java developer jobs', 'java programming jobs'] },
  { name: 'React', keywords: ['react js jobs', 'react developer vacancies'] },
  { name: 'Python', keywords: ['python developer jobs', 'python scripting openings'] },
  { name: 'Accounting', keywords: ['accounting jobs', 'tally accounting vacancies'] },
  { name: 'Recruitment', keywords: ['recruitment jobs', 'hr recruitment openings'] },
  { name: 'Salesforce', keywords: ['salesforce jobs', 'crm salesforce vacancies'] },
  { name: 'SQL', keywords: ['sql jobs', 'database sql openings'] },
  { name: 'AWS', keywords: ['aws cloud jobs', 'amazon web services vacancies'] },
  { name: 'Azure', keywords: ['azure cloud jobs'] },
  { name: 'Excel', keywords: ['advanced excel jobs', 'ms excel vacancies'] },
  { name: 'Communication', keywords: ['communication skills jobs'] },
  { name: 'Machine Learning', keywords: ['machine learning jobs', 'ml engineer openings'] },
  { name: 'Artificial Intelligence', keywords: ['ai jobs', 'artificial intelligence vacancies'] },
  { name: 'Data Analysis', keywords: ['data analyst jobs'] },
  { name: 'Cybersecurity', keywords: ['cyber security jobs'] },
  { name: 'Digital Marketing', keywords: ['digital marketing jobs', 'seo smm vacancies'] },
  { name: 'SEO', keywords: ['seo specialist jobs'] },
  { name: 'Cloud Computing', keywords: ['cloud computing jobs'] },
  { name: 'DevOps', keywords: ['devops jobs'] },
  { name: 'Angular', keywords: ['angular developer jobs'] },
  { name: 'Node.js', keywords: ['node js developer jobs'] },
  { name: 'Docker', keywords: ['docker jobs'] },
  { name: 'Kubernetes', keywords: ['kubernetes jobs'] },
  { name: 'Tableau', keywords: ['tableau jobs', 'data visualization openings'] },
  { name: 'Power BI', keywords: ['power bi jobs'] },
  { name: 'Leadership', keywords: ['leadership jobs'] },
  { name: 'Problem Solving', keywords: ['problem solving skills jobs'] },
  { name: 'Project Management', keywords: ['project management jobs'] },
  { name: 'Agile', keywords: ['agile methodology jobs'] },
  // IT
  { name: 'JavaScript', keywords: ['javascript jobs'] },
  { name: 'TypeScript', keywords: ['typescript jobs'] },
  { name: 'Next.js', keywords: ['next js jobs'] },
  { name: 'MongoDB', keywords: ['mongodb jobs'] },

  // Engineering
  { name: 'AutoCAD', keywords: ['autocad jobs'] },
  { name: 'SolidWorks', keywords: ['solidworks jobs'] },

  // Finance
  { name: 'Tally', keywords: ['tally accountant jobs'] },
  { name: 'GST', keywords: ['gst jobs'] },

  // Ops
  { name: 'Inventory Management', keywords: ['inventory management jobs'] },
  { name: 'Lean Manufacturing', keywords: ['lean manufacturing jobs'] },

];

const functionalAreaIndustryMap = {
  'Admin / Back Office / Computer Operator': 'Other',
  'Advertising / Communication': 'Media / Entertainment',
  'Administration & Facilities': 'Other',
  'BFSI, Investments & Trading': 'Banking / Insurance / Financial Services',
  'Civil Engineering': 'Construction',
  'Content, Editorial & Journalism': 'Media / Entertainment',
  'CSR & Social Service': 'Other',
  'Customer Success, Service & Operations': 'Other',
  'Customer Support': 'Other',
  'Clinical & Medical': 'Healthcare & Life Sciences',
  'Data Science & Analytics': 'IT / Software',
  'Delivery / Driver / Logistics': 'Logistics / Transportation',
  'Domestic Worker': 'Other',
  'Education & Training': 'Other',
  'Engineering - Hardware & Networks': 'IT / Software',
  'Engineering - Software & QA': 'IT / Software',
  'Environment Health & Safety': 'Manufacturing',
  'Facility Management': 'Other',
  'Finance & Accounting': 'Banking / Insurance / Financial Services',
  'Food, Beverage & Hospitality': 'Hospitality',
  'HR & Admin': 'Other',
  'Healthcare Support': 'Healthcare & Life Sciences',
  'Human Resources': 'Other',
  'IT & Information Security': 'IT / Software',
  'Legal & Regulatory': 'Other',
  'Maintenance Services': 'Manufacturing',
  'Marketing & Communication': 'Media / Entertainment',
  'Mechanical Engineering': 'Manufacturing',
  'Media Production & Entertainment': 'Media / Entertainment',
  'Merchandising, Retail & eCommerce': 'Retail & eCommerce',
  'Operations': 'Other',
  'Product Management': 'IT / Software',
  'Production, Manufacturing & Engineering': 'Manufacturing',
  'Procurement & Supply Chain': 'Logistics / Transportation',
  'Project & Program Management': 'Other',
  'Quality Assurance': 'Manufacturing',
  'Research & Development': 'Manufacturing',
  'Restaurant / Hospitality / Tourism': 'Hospitality',
  'Risk Management & Compliance': 'Banking / Insurance / Financial Services',
  'Sales & Business Development': 'Retail & eCommerce',
  'Security Services': 'Other',
  'Shipping & Maritime': 'Logistics / Transportation',
  'Software Engineering': 'IT / Software',
  'Strategic & Top Management': 'Other',
  'Tailoring, Apparel & Home Furnishing': 'Textile & Garments',
  'Teaching & Training': 'Other',
  'UX, Design & Architecture': 'IT / Software'
};

const validFunctionalAreas = new Set(
  functionalAreasData.map(f => f.name)
);

for (const role of rolesData) {
  if (!validFunctionalAreas.has(role.functionalAreaName)) {
    throw new Error(
      `❌ Role "${role.name}" has invalid Functional Area "${role.functionalAreaName}"`
    );
  }
}


async function seed() {
    try {
        await Industry.deleteMany({});
        await FunctionalArea.deleteMany({});
        await Role.deleteMany({});
        await Location.deleteMany({});
        await Skill.deleteMany({});

        const industriesMap = {};
        for (const ind of industriesData) {
            ind.slug = generateSlug(ind.name);
            const saved = await Industry.create(ind);
            industriesMap[ind.name] = saved._id;
        }

        const functionalAreasMap = {};
        for (const fa of functionalAreasData) {
            const industryName = functionalAreaIndustryMap[fa.name] || 'Other';
            const industryId = industriesMap[industryName];

            if (!industryId) {
                throw new Error(
                    `❌ Industry mapping missing for Functional Area "${fa.name}"`
                );
            }


            fa.slug = generateSlug(fa.name);
            fa.industry = industryId;

            const saved = await FunctionalArea.create(fa);
            functionalAreasMap[fa.name] = saved._id;
        }

        for (const role of rolesData) {
            const functionalAreaId = functionalAreasMap[role.functionalAreaName];

        if (!functionalAreaId) {
                throw new Error(
                    `❌ Invalid functionalAreaName "${role.functionalAreaName}" for role "${role.name}"`
                );
            }


            role.slug = generateSlug(role.name);
            role.functionalArea = functionalAreaId;

            await Role.create(role);
        }

        for (const loc of locationsData) {
            loc.slug = generateSlug(loc.name);
            await Location.create(loc);
        }

        for (const skill of skillsData) {
            skill.slug = generateSlug(skill.name);
            await Skill.create(skill);
        }

        console.log('✅ Seeding complete successfully');
        process.exit();
    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    }
}

seed();