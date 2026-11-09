import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? '',
  }),
});

async function main() {
  console.log('Seeding database...');

  const clinics = [
    {
      name: 'BrightSmile Dental - Downtown',
      address: '120 Main Street',
      city: 'Nairobi',
      phone: '+254700111222',
      services: [
        'General Checkup',
        'Teeth Cleaning',
        'Root Canal',
        'Cosmetic Whitening',
      ],
      isActive: true,
    },
    {
      name: 'BrightSmile Dental - Westlands',
      address: '45 Ring Road',
      city: 'Nairobi',
      phone: '+254700333444',
      services: [
        'Orthodontics',
        'Dental Implants',
        'Pediatric Dentistry',
        'Emergency Care',
      ],
      isActive: true,
    },
    {
      name: 'BrightSmile Dental - Mombasa Road',
      address: '78 Airport North Road',
      city: 'Mombasa',
      phone: '+254700555666',
      services: [
        'General Checkup',
        'Tooth Extraction',
        'Dentures',
        'Emergency Care',
      ],
      isActive: true,
    },
  ];

  for (const clinic of clinics) {
    const existingClinic = await prisma.clinic.findFirst({
      where: { name: clinic.name },
      orderBy: { createdAt: 'asc' },
    });

    if (existingClinic) {
      await prisma.clinic.update({
        where: { id: existingClinic.id },
        data: clinic,
      });
    } else {
      await prisma.clinic.create({ data: clinic });
    }
  }

  const insurancePlans = [
    {
      previousName: 'BrightSmile Basic Care',
      name: 'Bronze',
      monthlyCost: 350,
      coveragePerks: [
        'Best for singles',
        '1 checkup per year: Catch problems early',
        'Basic consultation: Talk to a dentist anytime',
        'Community support: WhatsApp group access',
      ],
      signupUrl: 'https://brightsmile.example.com/insurance/basic',
      isActive: true,
    },
    {
      previousName: 'BrightSmile Family Plus',
      name: 'Silver',
      monthlyCost: 550,
      coveragePerks: [
        'Best for families',
        '2 checkups per year: Stay ahead of problems',
        'Basic cleaning: Keep teeth healthy',
        'Pain relief: Emergency consultation',
        'Priority support: Faster appointments',
      ],
      signupUrl: 'https://brightsmile.example.com/insurance/family-plus',
      isActive: true,
    },
    {
      previousName: 'BrightSmile Premium Shield',
      name: 'Gold',
      monthlyCost: 700,
      coveragePerks: [
        'Complete protection',
        'Unlimited checkups: Come as often as needed',
        'Full cleaning: Deep clean + polishing',
        'Priority pain relief: Same-day emergency care',
        'Filling coverage: Emergency fillings included',
      ],
      signupUrl: 'https://brightsmile.example.com/insurance/premium-shield',
      isActive: true,
    },
  ];

  for (const plan of insurancePlans) {
    const existingPlan = await prisma.insurancePlan.findFirst({
      where: {
        name: { in: [plan.previousName, plan.name] },
      },
      orderBy: { createdAt: 'asc' },
    });
    const { previousName: _previousName, ...planData } = plan;

    if (existingPlan) {
      await prisma.insurancePlan.update({
        where: { id: existingPlan.id },
        data: planData,
      });
    } else {
      await prisma.insurancePlan.create({ data: planData });
    }
  }

  console.log('Seeding complete.');
}

main()
  .catch((error) => {
    console.error('Error seeding database:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
